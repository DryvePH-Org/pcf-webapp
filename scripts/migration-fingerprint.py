#!/usr/bin/env python3
"""Identify the exact migration files expected by this app release."""
import hashlib
from pathlib import Path


def fingerprint(root: Path) -> str:
    digest = hashlib.sha256()
    for path in sorted(root.glob('*.sql')):
        digest.update(path.name.encode())
        digest.update(b'\0')
        digest.update(path.read_bytes())
        digest.update(b'\0')
    return digest.hexdigest()


if __name__ == '__main__':
    print(fingerprint(Path('supabase/migrations')))
