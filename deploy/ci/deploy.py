#!/usr/bin/python3
"""Forced SSH command: accept one PCF image and deploy only the PCF service."""
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time

BASE = Path('/opt/pcf')
OTHERS = [
    'inventory-flow-caddy-1', 'mad-receipts', 'inventory-flow-n8n-1',
    'inventory-flow-backup-1', 'inventory-flow-image-worker-1',
    'inventory-flow-postgres-1',
]
SITES = ['https://invoice.dryveph.io', 'https://srv2113801.hstgr.cloud']


def parse_command(command):
    parts = shlex.split(command)
    if (len(parts) != 3 or parts[0] != 'deploy'
            or not re.fullmatch(r'[0-9a-f]{40}', parts[1])
            or not re.fullmatch(r'[0-9a-f]{64}', parts[2])):
        raise ValueError('Only deploy <commit-sha> <migration-fingerprint> is accepted')
    return parts[1], parts[2]


def run(args, timeout=120):
    return subprocess.run(args, check=True, text=True, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, timeout=timeout).stdout.strip()


def validate_archive(path, image):
    with tarfile.open(path, 'r:gz') as archive:
        member = archive.getmember('manifest.json')
        if not member.isfile() or member.size > 65536:
            raise ValueError('Invalid image manifest')
        manifest = json.load(archive.extractfile(member))
        if (not isinstance(manifest, list) or len(manifest) != 1
                or manifest[0].get('RepoTags') != [image]):
            raise ValueError('Archive must contain only the requested PCF image')


def with_image(config, image):
    lines = config.splitlines()
    if sum(line.startswith('PCF_IMAGE=') for line in lines) != 1:
        raise ValueError('Expected exactly one PCF_IMAGE setting')
    return '\n'.join('PCF_IMAGE=' + image if line.startswith('PCF_IMAGE=') else line
                     for line in lines) + '\n'


def write_config(config):
    target = BASE / '.env'
    temporary = BASE / '.env.next'
    temporary.write_text(config)
    temporary.chmod(0o600)
    temporary.replace(target)


def compose_up():
    run(['docker', 'compose', '--project-directory', str(BASE),
         '-f', str(BASE / 'compose.yml'), '-f', str(BASE / 'compose.proxy.yml'),
         'up', '-d', '--no-deps', 'app'])
    run(['sh', str(BASE / 'reconnect-proxy.sh')])


def status(url):
    return run(['curl', '--silent', '--show-error', '--max-time', '10',
                '--output', '/dev/null', '--write-out', '%{http_code}', url], timeout=15)


def snapshot():
    containers = run(['docker', 'inspect', '--format',
                      '{{.Name}} {{.Id}} {{.State.StartedAt}} {{.State.Running}}', *OTHERS])
    if not all(line.endswith(' true') for line in containers.splitlines()):
        raise RuntimeError('An existing project is not running; deployment stopped')
    sites = [status(url) for url in SITES]
    if sites != ['307', '404']:
        raise RuntimeError('Existing project responses differ from the verified baseline')
    return containers, sites


def wait_healthy():
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        try:
            if all(status(url) == '200' for url in [
                'http://127.0.0.1:3107/api/health',
                'https://pcf.dryveph.io/api/health',
                'https://pcf.dryveph.io/login',
            ]):
                return
        except (subprocess.SubprocessError, OSError):
            pass
        time.sleep(2)
    raise RuntimeError('PCF did not pass the local and HTTPS health checks')


def activate(image, revision, schema):
    before = snapshot()
    config = (BASE / '.env').read_text()
    previous = run(['docker', 'inspect', 'pcf-app-1', '--format', '{{.Image}}'])
    try:
        write_config(with_image(config, image))
        compose_up()
        wait_healthy()
        if snapshot() != before:
            raise RuntimeError('An existing project changed during deployment')
    except Exception:
        # Use the original image ID even if a tag was overwritten by a re-run.
        write_config(with_image(config, previous))
        compose_up()
        wait_healthy()
        print('PCF release failed; the previous PCF image was restored', flush=True)
        raise
    state = {
        'revision': revision, 'image': image, 'previous_image': previous,
        'migration_fingerprint': schema,
        'deployed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    (BASE / 'release.json').write_text(json.dumps(state, indent=2) + '\n')
    print('PCF deployed successfully: ' + revision, flush=True)


def main():
    os.umask(0o077)
    revision, schema = parse_command(os.environ.get('SSH_ORIGINAL_COMMAND', ''))
    if schema != (BASE / 'schema.sha256').read_text().strip():
        raise RuntimeError('Migration files changed. Apply and verify the new Supabase migrations, '
                           'then update /opt/pcf/schema.sha256 before deploying.')
    with (BASE / '.deploy.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if shutil.disk_usage(BASE).free < 2 * 1024**3:
            raise RuntimeError('Less than 2 GiB free disk; deployment stopped')
        releases = BASE / 'releases'
        releases.mkdir(mode=0o700, exist_ok=True)
        path = None
        try:
            with tempfile.NamedTemporaryFile(dir=releases, suffix='.tar.gz', delete=False) as upload:
                path = Path(upload.name)
                size = 0
                while chunk := sys.stdin.buffer.read(1024 * 1024):
                    size += len(chunk)
                    if size > 512 * 1024**2:
                        raise ValueError('PCF release archive exceeds 512 MiB')
                    upload.write(chunk)
            image = 'pcf/app:' + revision
            validate_archive(path, image)
            print('PCF image upload verified', flush=True)
            run(['docker', 'load', '--input', str(path)], timeout=180)
            details = json.loads(run(['docker', 'image', 'inspect', image]))[0]
            if (details['Architecture'] != 'amd64'
                    or details['Config'].get('Labels', {}).get('org.opencontainers.image.revision') != revision):
                raise ValueError('Image architecture or revision does not match this release')
            activate(image, revision, schema)
        finally:
            if path is not None:
                path.unlink(missing_ok=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Subprocess commands contain no credentials. Do not print captured logs,
        # environment files, or docker inspect payloads in public Actions logs.
        print('Deployment failed: ' + str(error), file=sys.stderr)
        sys.exit(1)
