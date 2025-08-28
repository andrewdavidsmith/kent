// clang-format off
#include "cheapcgi.h"
#include "common.h"
#include "hdb.h"  // hAllocConn
#include "cartDb.h"  // cartDbParseId
#include "jksql.h"
// clang-format on

#include <stdio.h>
#include <zlib.h>

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
write_output(gzFile gz, const char *fmt, ...) {
  va_list args;
  va_start(args, fmt);
  if (gz)
    gzvprintf(gz, fmt, args);
  else
    vprintf(fmt, args);
  va_end(args);
}

static void
doMethBaseMetadata(gzFile gz) {
  char table_name[] = "MethBaseMeta";
  char colors_table_name[] = "MethBaseMetaColors";

  char *db = cgiOptionalString("db");
  if (!db)
    errAbort("Missing required parameter: db.");

  struct sqlConnection *conn = hAllocConn(db);

  // Do colors
  write_output(gz, "\"Colors\": {");  // open JSON dict for colors
  char query[1024];
  sqlSafef(query, sizeof(query), "SELECT * FROM %s", colors_table_name);
  struct sqlResult *sr = sqlGetResult(conn, query);
  char **row;
  boolean first = TRUE;
  while ((row = sqlNextRow(sr)) != NULL) {
    if (!first)
      write_output(gz, ",");  // comma to separate rows
    else
      first = FALSE;
    write_output(gz, "\"%s\": \"%s\"", row[0], row[1]);
  }
  write_output(gz, "},");  // close JSON dict for colors

  // Do methylomes
  struct slName *fieldList = sqlListFields(conn, table_name);
  sqlSafef(query, sizeof(query), "SELECT * FROM %s", table_name);
  sr = sqlGetResult(conn, query);

  write_output(gz, "\"MethBase2\": [");  // open JSON array for MethBase2

  first = TRUE;
  while ((row = sqlNextRow(sr)) != NULL) {
    if (!first)
      write_output(gz, ",");  // comma to separate rows
    else
      first = FALSE;

    write_output(gz, "{");
    int c_idx = 0;
    for (struct slName *field = fieldList; field; field = field->next) {
      if (c_idx > 0)
        write_output(gz, ",");  // comma to separate columns within rows
      write_output(gz, "\"%s\": \"%s\"", field->name,
                   row[c_idx] ? row[c_idx] : "NA");
      ++c_idx;
    }
    write_output(gz, "}");
  }
  write_output(gz, "]");  // close JSON array for MethBase2

  sqlFreeResult(&sr);  // cleanup
  hFreeConn(&conn);
}

static void
doGetSession(gzFile gz) {
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

  write_output(gz, "\"sessionDb.contents\": \"%s\"",
               sqlNeedQuickString(conn, query));

  hFreeConn(&conn);  // cleanup
}

static int
doMethBase(boolean use_gzip, boolean refresh) {
  // send HTTP headers (with Content-Encoding: gzip)
  printf("Content-Type: application/json\r\n");
  if (use_gzip)
    printf("Content-Encoding: gzip\r\n");
  printf("\r\n");  // End headers

  fflush(stdout);  // Make sure headers are sent

  // wrap stdout in gzip stream if requested
  gzFile gz = use_gzip ? gzdopen(fileno(stdout), "wb") : NULL;
  if (use_gzip && !gz) {
    fprintf(stderr, "Failed to open gzip stream on stdout\n");
    return 1;
  }

  write_output(gz, "{");
  if (refresh) {
    doMethBaseMetadata(gz);
    write_output(gz, ",");  // separate the JSON parts
  }
  doGetSession(gz);
  write_output(gz, "}");  // end JSON

  // flush and close gzip stream
  if (gz) {
    gzflush(gz, Z_SYNC_FLUSH);
    gzclose(gz);
  }
  return 0;
}

int
main(int argc, char *argv[]) {
  cgiSpoof(&argc, argv);

  char *action = cgiOptionalString("action");
  if (!action)
    errAbort("Missing required parameter: action");
  const boolean is_update = sameWord(action, "update");
  if (is_update)
    return doUpdate();

  if (!sameWord(action, "metadata"))
    errAbort("invalid param: action=%s (must be %s or %s)", action, "update",
             "metadata");

  boolean useGzip = FALSE;
  char *gzipToken = cgiOptionalString("gzip");
  if (gzipToken != NULL && sameString(gzipToken, "1"))
    useGzip = TRUE;

  boolean refreshMetaData = FALSE;
  char *refreshMetaDataToken = cgiOptionalString("refresh");
  if (refreshMetaDataToken != NULL && sameString(refreshMetaDataToken, "1"))
    refreshMetaData = TRUE;

  return doMethBase(useGzip, refreshMetaData);
}
