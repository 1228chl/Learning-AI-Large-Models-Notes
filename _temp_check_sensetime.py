import sqlite3, json
db = sqlite3.connect(r'C:\Users\21241\.cc-switch\cc-switch.db')
c = db.cursor()

# 所有商汤日日新 provider 的 endpoint
c.execute('''SELECT p.id, p.name, p.provider_type, e.url
FROM providers p LEFT JOIN provider_endpoints e ON p.id = e.provider_id
WHERE p.name LIKE '%日%' OR p.name LIKE '%商汤%' OR p.name LIKE '%sensenova%' OR p.name LIKE '%Sense%'
ORDER BY p.sort_index''')
rows = c.fetchall()
for r in rows:
    print(r)

print()
# 查一下完整的 settings_config 和 meta
c.execute('''SELECT id, name, settings_config, meta FROM providers WHERE id = '0b45150e-3a5c-4707-a0d3-674bb92ebf34' ''')
r = c.fetchone()
config = json.loads(r[2])
meta = json.loads(r[3]) if r[3] else {}

print('=== Settings Config ===')
print(json.dumps(config, indent=2, ensure_ascii=False))
print()
print('=== Meta ===')
print(json.dumps(meta, indent=2, ensure_ascii=False))

db.close()