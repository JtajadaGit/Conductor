// @conductor REQ-SESSION
// Session store with 30m TTL (demo fixture). NOTE: no test traces this requirement → gap.
export class SessionStore {
  ttlMinutes = 30;
}
