import re

cat_sql = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\expense_category.sql"
exp_sql = r"c:\Users\Acer P16\Documents\Spiritmed\hospital update\database\expense (1).sql"

def unquote(v):
    if not v: return None
    v = v.strip()
    if v.upper() == 'NULL': return None
    if v.startswith("'") and v.endswith("'"):
        v = v[1:-1]
    return v.replace("\\'", "'").replace('\\"', '"').replace('\\n', '\n').replace('\\r', '\r').replace('\\\\', '\\')

def split_values(row_str):
    values, current, in_q = [], '', False
    i = 0
    while i < len(row_str):
        c = row_str[i]
        if c == '\\' and in_q:
            current += c
            if i + 1 < len(row_str): current += row_str[i+1]; i += 2
            else: i += 1
            continue
        elif c == "'" and not in_q: in_q = True; current += c
        elif c == "'" and in_q:
            if i + 1 < len(row_str) and row_str[i+1] == "'": current += "''"; i += 2; continue
            in_q = False; current += c
        elif c == ',' and not in_q: values.append(current.strip()); current = ''
        else: current += c
        i += 1
    if current.strip(): values.append(current.strip())
    return values

def extract_tuples(sql_content, table_name):
    inserts = [m.start() for m in re.finditer(rf'INSERT INTO `{table_name}`', sql_content, re.IGNORECASE)]
    rows = []
    for start_idx in inserts:
        values_idx = sql_content.find("VALUES", start_idx)
        if values_idx != -1:
            end_semicolon = sql_content.find(";\n", values_idx)
            if end_semicolon == -1: end_semicolon = sql_content.find(";", values_idx)
            block = sql_content[values_idx + 6:end_semicolon]
            depth, s = 0, None
            for i, ch in enumerate(block):
                if ch == '(':
                    if depth == 0: s = i + 1
                    depth += 1
                elif ch == ')':
                    depth -= 1
                    if depth == 0 and s is not None:
                        rows.append(block[s:i])
                        s = None
    return rows

print("=== Expense Category Analysis ===")
with open(cat_sql, 'r', encoding='utf-8', errors='replace') as f:
    cat_content = f.read()

m_cat = re.search(r"CREATE TABLE `expense_category` \((.*?)\) ENGINE", cat_content, re.DOTALL | re.IGNORECASE)
if m_cat:
    print("Schema:")
    print(m_cat.group(1).strip())

cat_tuples = extract_tuples(cat_content, 'expense_category')
print(f"Total expense categories: {len(cat_tuples)}")
for t in cat_tuples[:10]:
    print("  ", [unquote(v) for v in split_values(t)])

print("\n=== Expense Analysis ===")
with open(exp_sql, 'r', encoding='utf-8', errors='replace') as f:
    exp_content = f.read()

m_exp = re.search(r"CREATE TABLE `expense` \((.*?)\) ENGINE", exp_content, re.DOTALL | re.IGNORECASE)
if m_exp:
    print("Schema:")
    print(m_exp.group(1).strip())

exp_tuples = extract_tuples(exp_content, 'expense')
print(f"Total expenses: {len(exp_tuples)}")
if exp_tuples:
    print("Sample expense tuple:")
    cols = [unquote(v) for v in split_values(exp_tuples[0])]
    for idx, c in enumerate(cols):
        print(f"  Col {idx}: {c}")
