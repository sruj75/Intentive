export async function applyMigrationText(sql, sqlText) {
  const statements = splitMigrationStatements(sqlText);
  if (statements.length === 0) {
    return [];
  }
  return sql.transaction((transaction) =>
    statements.map((statement) => transaction.query(statement)),
  );
}

export function splitMigrationStatements(sqlText) {
  return stripSqlComments(sqlText)
    .split(";")
    .map((statement) => stripSqlComments(statement).trim())
    .filter(Boolean);
}

function stripSqlComments(statement) {
  return statement
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}
