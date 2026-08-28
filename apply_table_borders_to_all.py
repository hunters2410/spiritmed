import glob
import re

files = glob.glob('src/pages/*.tsx')
print(f'Checking {len(files)} files...')

for filepath in files:
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    if '<table' not in content:
        continue

    original = content

    # 1. Update <table className="..."> to include border-collapse border border-gray-200 dark:border-gray-700
    def fix_table_class(m):
        cls = m.group(1)
        if 'border-collapse' not in cls:
            cls = cls.rstrip('"') + ' border-collapse border border-gray-200 dark:border-gray-700"'
        return f'<table className={cls}'

    content = re.sub(r'<table\s+className=("[^"]*")', fix_table_class, content)

    # 2. Update <tr className="bg-gray-50 ..."> to bg-gray-100 dark:bg-gray-900 for headers
    def fix_thead_tr(m):
        tag = m.group(0)
        if 'bg-gray-50' in tag:
            tag = tag.replace('bg-gray-50', 'bg-gray-100')
        return tag

    content = re.sub(r'<tr[^>]*bg-gray-50[^>]*>', fix_thead_tr, content)

    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'Updated table borders in {filepath}')

print('Done applying table border styling!')
