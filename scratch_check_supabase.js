import fs from 'fs';

const dumpPath = "database/u819957882_urocaresystem (16).sql";
const content = fs.readFileSync(dumpPath, 'utf8');

function checkTableForWhite(tableName) {
  const pattern = "INSERT INTO\\s+\\x60" + tableName + "\\x60\\s*(?:\\([^)]+\\))?\\s*VALUES\\s*(.*?);\\s*(?=INSERT|ALTER|COMMIT|$)";
  const insertPat = new RegExp(pattern, 'is');
  const match = content.match(insertPat);
  if (match) {
    const block = match[1];
    const hasWhite = block.toLowerCase().includes("'white'");
    console.log(`Table ${tableName} has 'white': ${hasWhite}`);
    if (hasWhite) {
      // Find rows containing 'white'
      const rows = block.split(/\),?\s*\(/);
      const whiteRows = rows.filter(r => r.toLowerCase().includes("'white'"));
      console.log(`Found ${whiteRows.length} rows containing 'white' in table ${tableName}. First 3:`);
      console.log(whiteRows.slice(0, 3));
    }
  } else {
    console.log(`Table ${tableName} not found.`);
  }
}

checkTableForWhite('medicalhistory');
checkTableForWhite('medical_history');
checkTableForWhite('odontogram');
