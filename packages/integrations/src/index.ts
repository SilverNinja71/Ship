// @ship/integrations: adapters that turn Canvas, Todoist, Lodestar calendar
// exports, Google Drive, Parchment files and CSV decks into the shapes in
// @ship/shared-types, plus the Gemini client (the Lookout's video judge and
// the Captain's Log grader). Network adapters take a FetchLike and never call
// `fetch` themselves.

export { createRelayFetch, isRelayResponse, relayEndpoint, responseFromRelay } from "./relay.js";
export {
  HttpError,
  getCursorPaged,
  getLinkPaged,
  mapWithConcurrency,
  parseLinkHeader,
  requestJson,
  requestText,
  withQuery,
} from "./http.js";
export type { FetchInit, FetchResponse, PagingOptions } from "./http.js";

export {
  getCanvasCourseColors,
  getCanvasCourseNicknames,
  getCanvasGroupWeights,
  listCanvasAssignments,
  listCanvasCourses,
  mapCanvasAssignment,
  mapCanvasCourse,
  normalizeCanvasBaseUrl,
  syncCanvas,
} from "./canvas.js";
export type { CanvasCourse, CanvasSettings, CanvasSyncResult } from "./canvas.js";

export {
  TODOIST_API_BASE,
  TODOIST_COLORS,
  listTodoistProjects,
  listTodoistTasks,
  mapTodoistTask,
  parseTodoistDate,
  syncTodoist,
} from "./todoist.js";
export type { TodoistProject, TodoistSettings, TodoistSyncResult } from "./todoist.js";

export { icsPriorityToShip, parseIcs, parseIcsLine, parseIcsTime, unescapeIcsText, unfoldIcsLines } from "./ics.js";
export type { IcsImport, IcsOptions, IcsTime } from "./ics.js";
export { importLodestarCalendar } from "./lodestar.js";

export {
  GOOGLE_DRIVE_FILES_URL,
  GOOGLE_DRIVE_READONLY_SCOPE,
  GOOGLE_MIME,
  downloadDriveText,
  driveQuery,
  exportGoogleDocText,
  fetchDriveLibrary,
  listDriveFiles,
  mapDriveFile,
  syncGoogleDrive,
  textExportMimeType,
} from "./googleDrive.js";
export type { DriveListOptions, DriveQueryOptions, GoogleDriveSettings } from "./googleDrive.js";

export { BplistError, PlistUid, isBplist, parseBplist } from "./parchment/bplist.js";
export type { BplistOptions, PlistDict, PlistValue } from "./parchment/bplist.js";
export { PARCHMENT_MAGIC, parseParchmentArchive, resolveKeyedArchive } from "./parchment/archive.js";
export type { ParchmentArchiveOptions, ParchmentArchiveResult } from "./parchment/archive.js";
export { looksLikeParchmentStudy, parseParchmentStudy } from "./parchment/study.js";
export type { ParchmentStudyOptions } from "./parchment/study.js";

export { detectDelimiter, detectHeader, importCsvCards, parseDelimited } from "./csv.js";
export type { CsvDelimiter, CsvImportOptions, CsvImportResult, CsvParseResult } from "./csv.js";

export { decodeText, importFile } from "./importFile.js";
export type { ImportFileOptions } from "./importFile.js";

export {
  DEFAULT_GEMINI_MODEL,
  GEMINI_API_BASE,
  GEMINI_KEY_URL,
  GeminiError,
  checkGeminiModel,
  clipText,
  extractCandidateText,
  geminiErrorDetail,
  geminiGenerateUrl,
  geminiModelUrl,
  generateGeminiJson,
  normalizeGeminiModel,
  parseJsonLoose,
} from "./gemini.js";
export type { GeminiCallOptions } from "./gemini.js";
export { BLURT_GEMINI_TIMEOUT_MS, BLURT_SYSTEM_PROMPT, buildBlurtRequest, gradeBlurtWithGemini, readBlurtGrades } from "./geminiBlurt.js";
export type { GeminiBlurtOptions } from "./geminiBlurt.js";

export { guessKind } from "./kind.js";
export { APPLE_REFERENCE_EPOCH_MS, appleSecondsToEpochMs, endOfLocalDay, parseDateString, toEpochMs } from "./time.js";
export type { NumericDateEncoding } from "./time.js";
export type { Clock, IdFactory } from "./values.js";
