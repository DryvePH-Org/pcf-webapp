import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  driveConfigured,
  driveSafeName,
  resetDriveCache,
  uploadToDrive,
} from '@/lib/google-drive';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('google drive client', () => {
  beforeEach(() => {
    resetDriveCache();
    vi.stubEnv('GOOGLE_CLIENT_ID', 'id');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'secret');
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', 'refresh');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is off until a complete set of settings exists', () => {
    expect(driveConfigured()).toBe(true);
    vi.stubEnv('GOOGLE_REFRESH_TOKEN', '');
    expect(driveConfigured()).toBe(false);
    vi.stubEnv('GOOGLE_SCRIPT_URL', 'https://script.google.com/macros/s/abc/exec');
    expect(driveConfigured()).toBe(false); // the script also needs its secret
    vi.stubEnv('GOOGLE_SCRIPT_SECRET', 'a-long-random-secret-value');
    expect(driveConfigured()).toBe(true);
  });

  it('makes names safe for Drive and for search queries', () => {
    expect(driveSafeName('Main/Petty:Cash*')).toBe('Main-Petty-Cash-');
    expect(driveSafeName('  ‮evil\u0000 name  ')).toBe('evil name');
    expect(driveSafeName('')).toBe('untitled');
    expect(driveSafeName('x'.repeat(200)).length).toBe(80);
  });

  it('creates missing folders, then uploads the photo with its metadata', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url.includes('oauth2.googleapis.com')) return json({ access_token: 'tok', expires_in: 3600 });
      if (url.includes('uploadType=multipart')) return json({ id: 'file1', webViewLink: 'https://drive.google.com/file/d/file1/view' });
      if (init?.method === 'POST') return json({ id: `folder${calls.length}` }); // folder create
      return json({ files: [] }); // folder search: nothing yet
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadToDrive({
      folders: ["Main's Fund", '2026-11'],
      fileName: 'PCV-2026-0001-paper-voucher.jpg',
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([1, 2, 3]).buffer,
    });

    expect(result).toEqual({ id: 'file1', url: 'https://drive.google.com/file/d/file1/view' });

    // Every Drive call carries the bearer token.
    const driveCalls = calls.filter((c) => !c.url.includes('oauth2'));
    for (const call of driveCalls) {
      expect((call.init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    }
    // The apostrophe in the fund name is escaped inside the search query.
    const searchUrls = driveCalls
      .map((c) => decodeURIComponent(c.url.replace(/\+/g, ' ')))
      .join('\n');
    expect(searchUrls).toContain("Main\\'s Fund");

    // The upload is multipart with JSON metadata then the raw bytes.
    const upload = calls.find((c) => c.url.includes('uploadType=multipart'))!;
    const body = upload.init!.body as Uint8Array;
    const text = new TextDecoder().decode(body);
    expect(text).toContain('"name":"PCV-2026-0001-paper-voucher.jpg"');
    expect(text).toContain('Content-Type: image/jpeg');
  });

  it('reuses existing folders and a cached token', async () => {
    let tokenCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('oauth2')) {
          tokenCalls += 1;
          return json({ access_token: 'tok', expires_in: 3600 });
        }
        if (url.includes('uploadType=multipart')) return json({ id: 'f', webViewLink: 'https://drive.google.com/x' });
        if (init?.method === 'POST') throw new Error('should not create folders');
        return json({ files: [{ id: 'existing' }] });
      }),
    );
    const input = { folders: ['Fund'], fileName: 'a.jpg', mimeType: 'image/jpeg', bytes: new ArrayBuffer(1) };
    await uploadToDrive(input);
    await uploadToDrive(input);
    expect(tokenCalls).toBe(1);
  });

  it('uploads through an Apps Script web app when one is configured', async () => {
    vi.stubEnv('GOOGLE_SCRIPT_URL', 'https://script.google.com/macros/s/abc/exec');
    vi.stubEnv('GOOGLE_SCRIPT_SECRET', 'a-long-random-secret-value');
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const sent = JSON.parse(init!.body as string);
      expect(sent.secret).toBe('a-long-random-secret-value');
      expect(sent.folders).toEqual(['Main-Fund', '2026-11']);
      expect(sent.fileName).toBe('PCV-1-receipt.jpg');
      expect(Buffer.from(sent.data, 'base64')).toEqual(Buffer.from([1, 2, 3]));
      return json({ ok: true, id: 'f1', url: 'https://drive.google.com/file/d/f1/view' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await uploadToDrive({
      folders: ['Main/Fund', '2026-11'],
      fileName: 'PCV-1-receipt.jpg',
      mimeType: 'image/jpeg',
      bytes: new Uint8Array([1, 2, 3]).buffer,
    });
    expect(result.url).toContain('drive.google.com');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects a script that refuses or answers with a foreign link', async () => {
    vi.stubEnv('GOOGLE_SCRIPT_URL', 'https://script.google.com/macros/s/abc/exec');
    vi.stubEnv('GOOGLE_SCRIPT_SECRET', 'a-long-random-secret-value');
    const input = { folders: [], fileName: 'a.jpg', mimeType: 'image/jpeg', bytes: new ArrayBuffer(1) };

    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: false, error: 'unauthorized' })));
    await expect(uploadToDrive(input)).rejects.toThrow(/refused the upload \(unauthorized\)/);

    vi.stubGlobal('fetch', vi.fn(async () => json({ ok: true, id: 'x', url: 'https://evil.example/x' })));
    await expect(uploadToDrive(input)).rejects.toThrow(/unexpected link/);
  });

  it('fails loudly when Google refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 401 })));
    await expect(
      uploadToDrive({ folders: [], fileName: 'a.jpg', mimeType: 'image/jpeg', bytes: new ArrayBuffer(1) }),
    ).rejects.toThrow(/Google sign-in failed/);
  });
});
