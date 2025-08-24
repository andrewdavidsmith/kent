#include "cheapcgi.h"
#include "common.h"
#include "hCommon.h"
#include "hdb.h"  // hAllocConn
#include "jksql.h"
#include <stdbool.h>
#include <stdio.h>

static inline void
parse_hgsid(char *hgsid, char **id, char **sessionKey) {
  char *underscore = strchr(hgsid, '_');
  if (!underscore) {
    errAbort("Malformed value for hgsid: %s.", hgsid);
    return;
  }
  *underscore = '\0';            // terminate sessionDb.id
  *id = hgsid;                   // sessionDb.id part of hgsid
  *sessionKey = underscore + 1;  // sessionDb.sessionKey part of hgsid

  // Escape id and sessionKey to avoid SQL injection
  *id = sqlEscapeString(*id);
  *sessionKey = sqlEscapeString(*sessionKey);
  if (isEmpty(*id) || isEmpty(*sessionKey))
    errAbort("Failed to parse required parameters: id and sessionKey.");
  *underscore = '_';  // put it back
}

void
doMethBaseMetadata() {
  const char table_name[] = "MethBaseMeta";
  const char *db = cgiOptionalString("db");
  if (isEmpty(db)) {
    errAbort("Missing required parameter: db.");
    return;
  }
  struct sqlConnection *conn = hAllocConn(db);
  struct slName *fieldList = sqlListFields(conn, table_name);

  char query[1024];
  sqlSafef(query, sizeof(query), "SELECT * FROM %s", table_name);
  struct sqlResult *sr = sqlGetResult(conn, query);

  printf("\"MethBase2\": [");  // open JSON array for MethBase2

  char **row;
  bool first = true;
  while ((row = sqlNextRow(sr)) != NULL) {
    if (!first)
      printf(",");  // comma to separate rows
    else
      first = false;

    printf("{");
    int i = 0;
    for (struct slName *field = fieldList; field; field = field->next, ++i) {
      if (i > 0)
        printf(",");  // comma to separate columns within rows
      printf("\"%s\": \"%s\"", field->name, row[i] ? row[i] : "(NULL)");
    }
    printf("}");
  }
  printf("]");  // close JSON array for MethBase2

  // Cleanup
  sqlFreeResult(&sr);
  hFreeConn(&conn);
}

void
doGetSession() {
  char *hgsid = cgiOptionalString("hgsid");
  if (isEmpty(hgsid)) {
    errAbort("Missing required parameter: hgsid.");
    return;
  }

  struct sqlConnection *conn = hAllocConnProfile("central", "hgcentral");
  if (conn == NULL)
    errAbort("Failed to connect to 'hgcentral' DB using profile 'central'.");

  char *escapedId = NULL;
  char *escapedSessionKey = NULL;
  parse_hgsid(hgsid, &escapedId, &escapedSessionKey);

  char query[1024];
  sqlSafef(
    query, sizeof(query),
    "SELECT contents FROM sessionDb WHERE id = '%s' AND sessionKey = '%s';",
    escapedId, escapedSessionKey);

  struct sqlResult *sr = sqlGetResult(conn, query);

  char **row = sqlNextRow(sr);

  if (row == NULL)
    errAbort("Failed to match id=%s and sessionKey=%s in hgcentral.sessionDb",
             escapedId, escapedSessionKey);
  printf("\"sessionDb.contents\": \"%s\"", row[0]);

  if (sqlNextRow(sr))
    errAbort("More than one row matches id=%s and sessionKey=%s", escapedId,
             escapedSessionKey);

  // cleanup
  hFreeConn(&conn);
  sqlFreeResult(&sr);
  free(escapedSessionKey);
  free(escapedId);
}

void
doMethBase() {
  // send HTTP header
  printf("Content-Type: application/json\n\n");
  printf("{");  // start JSON
  doMethBaseMetadata();
  printf(",");  // separate the JSON parts
  doGetSession();
  printf("}");  // end JSON
}

int
main(int argc, char *argv[]) {
  cgiSpoof(&argc, argv);
  doMethBase();
  return 0;
}
