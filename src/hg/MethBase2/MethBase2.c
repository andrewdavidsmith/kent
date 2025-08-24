#include <stdbool.h>
#include <stdio.h>

#include "cheapcgi.h"
#include "hdb.h"  // hAllocConn
#include "cartDb.h"  // cartDbParseId
#include "jksql.h"

static int
doUpdate() {
  char db[] = "hgcentral";
  char profile[] = "central";

  char *hgsid = cgiOptionalString("hgsid");
  if (!hgsid)
    errAbort("Missing required parameter: hgsid.");

  struct sqlConnection *conn = hAllocConnProfile(profile, db);
  char *sessionKey = NULL;
  const int id = cartDbParseId(hgsid, &sessionKey);

  const char *contents = cgiOptionalString("contents");
  if (!contents)
    errAbort("Missing required parameters: contents.");

  char *escapedContents = sqlEscapeString(contents);

  char query[8192];
  sqlSafef(query, sizeof(query),
           "UPDATE sessionDb SET contents = '%s' WHERE id = '%d' AND "
           "sessionKey = '%s';",
           escapedContents, id, sessionKey);

  sqlUpdate(conn, query);

  hFreeConn(&conn);

  printf("Status: 204 No Content\r\n");  // response: success, and no content
  printf("Content-Type: text/plain\r\n\r\n");

  return 0;
}

static void
doMethBaseMetadata() {
  char table_name[] = "MethBaseMeta";

  char *db = cgiOptionalString("db");
  if (!db)
    errAbort("Missing required parameter: db.");

  struct sqlConnection *conn = hAllocConn(db);
  struct slName *fieldList = sqlListFields(conn, table_name);

  char query[1024];
  sqlSafef(query, sizeof(query), "SELECT * FROM %s", table_name);

  struct sqlResult *sr = sqlGetResult(conn, query);

  printf("\"MethBase2\": [");  // open JSON array for MethBase2

  char **row;
  int first = true;
  while ((row = sqlNextRow(sr)) != NULL) {
    if (!first)
      printf(",");  // comma to separate rows
    else
      first = false;

    printf("{");
    int c_idx = 0;
    for (struct slName *field = fieldList; field; field = field->next) {
      if (c_idx > 0)
        printf(",");  // comma to separate columns within rows
      printf("\"%s\": \"%s\"", field->name, row[c_idx] ? row[c_idx] : "NA");
      ++c_idx;
    }
    printf("}");
  }
  printf("]");  // close JSON array for MethBase2

  sqlFreeResult(&sr);  // cleanup
  hFreeConn(&conn);
}

static void
doGetSession() {
  char db[] = "hgcentral";
  char profile[] = "central";

  char *hgsid = cgiOptionalString("hgsid");
  if (!hgsid)
    errAbort("Missing required parameter: hgsid.");

  struct sqlConnection *conn = hAllocConnProfile(profile, db);
  char *sessionKey = NULL;
  const int id = cartDbParseId(hgsid, &sessionKey);

  char query[1024];
  sqlSafef(
    query, sizeof(query),
    "SELECT contents FROM sessionDb WHERE id = '%d' AND sessionKey = '%s';", id,
    sessionKey);

  printf("\"sessionDb.contents\": \"%s\"", sqlNeedQuickString(conn, query));

  hFreeConn(&conn);  // cleanup
}

static int
doMethBase() {
  // send HTTP header
  printf("Content-Type: application/json\n\n");
  printf("{");  // start JSON
  doMethBaseMetadata();
  printf(",");  // separate the JSON parts
  doGetSession();
  printf("}");  // end JSON
  return 0;
}

int
main(int argc, char *argv[]) {
  cgiSpoof(&argc, argv);
  char *action = cgiOptionalString("action");
  if (!action)
    errAbort("Missing required parameter: action");
  const bool is_update = sameWord(action, "update");
  if (!is_update && !sameWord(action, "metadata"))
    errAbort("invalid param: action=%s (must be %s or %s)", action, "update",
             "metadata");
  return is_update ? doUpdate() : doMethBase();
}
