#!/usr/bin/env python3
"""Export explicitly recorded bookkeeping facts; never infer matches/payments."""
import argparse
import csv
import hashlib
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('root', type=Path)
parser.add_argument('output', type=Path)
args = parser.parse_args()
root = args.root.resolve()
def read(name):
    with (root / name).open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
paths = ['underlag/2026/transaktioner.csv', 'underlag/2026/inventering.csv',
         'underlag/2026/utskickslogg.csv', 'docs/metadata/bank-id-alias.csv']
transactions, documents, sent, aliases = map(read, paths)
hashes = set()
for document in documents:
    p = (root / document['lokal_fil']).resolve()
    if not p.is_relative_to(root) or not p.is_file() or digest(p) != document['fil_sha256']:
        raise ValueError('Missing/out-of-scope document or incorrect hash: '+document['lokal_fil'])
    if document['fil_sha256'] in hashes:
        raise ValueError('Duplicate document content')
    hashes.add(document['fil_sha256'])
keys = {t['provider_transaktion_id'] for t in transactions}
if len(keys) != len(transactions):
    raise ValueError('Duplicate transaction key')
for document in documents:
    if document['koppling'] in ['bekraftad', 'bekraftad-lokalt'] and document['provider_transaktion_id'] not in keys:
        raise ValueError('Confirmed document lacks transaction')
# Explicit invoice decisions prepared and reviewed by Codex, outside Railway.
plan_path = root / 'docs/metadata/bookkeeping-invoices-2026-10-11.json'
invoices = json.loads(plan_path.read_text()) if plan_path.exists() else []
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps({'sourceRoot': str(root), 'sourceHashes': {p: digest(root/p) for p in paths},
    'transactions': transactions, 'documents': documents, 'aliases': aliases, 'invoices': invoices}, ensure_ascii=False, indent=2)+'\n')
args.output.chmod(0o600)
print(json.dumps({'transactions': len(transactions), 'confirmed': sum(t['matchningsstatus']=='bekraftad' for t in transactions),
                  'documents': len(documents), 'invoices': len(invoices)}))
