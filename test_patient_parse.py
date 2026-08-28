import ast
import re

def parse_sql_values(tuple_str):
    # Remove trailing comma/semicolon and wrapping parentheses
    t_str = tuple_str.strip().rstrip(';,')
    if t_str.startswith('(') and t_str.endswith(')'):
        t_str = t_str[1:-1]
    
    # Use python ast or csv reader / regex
    # Standard SQL NULL replacement to None for literal_eval
    # Replace NULL with None, convert SQL string syntax to python
    tokens = []
    current = []
    in_quotes = False
    escape = False
    
    i = 0
    n = len(t_str)
    while i < n:
        char = t_str[i]
        if escape:
            current.append(char)
            escape = False
        elif char == '\\':
            escape = True
        elif char == "'":
            in_quotes = not in_quotes
            current.append(char)
        elif char == ',' and not in_quotes:
            val = ''.join(current).strip()
            tokens.append(val)
            current = []
        else:
            current.append(char)
        i += 1
    if current:
        tokens.append(''.join(current).strip())

    cleaned = []
    for tok in tokens:
        if tok.upper() == 'NULL':
            cleaned.append(None)
        elif tok.startswith("'") and tok.endswith("'"):
            # strip quotes and unescape
            val = tok[1:-1].replace("''", "'").replace("\\'", "'").replace("\\\\", "\\")
            cleaned.append(val)
        else:
            # integer or number
            try:
                if '.' in tok:
                    cleaned.append(float(tok))
                else:
                    cleaned.append(int(tok))
            except:
                cleaned.append(tok)
    return cleaned

with open(r'database/patient (4).sql', 'r', encoding='utf-8', errors='ignore') as f:
    sql = f.read()

lines = [l.strip() for l in sql.splitlines() if l.strip().startswith('(') and (l.strip().endswith('),') or l.strip().endswith(');'))]
print(f'Parsed {len(lines)} lines.')

for idx in [0, 100, 500, 8139]:
    row = parse_sql_values(lines[idx])
    old_id = row[0]
    name = row[2]
    patient_id = row[12]
    file_no = row[46] if len(row) > 46 else None
    print(f'Row {idx}: old_id={old_id} | name={name} | patient_id={patient_id} | file_no={file_no}')
