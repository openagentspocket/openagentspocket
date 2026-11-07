import { test } from "node:test";
import assert from "node:assert/strict";

import { paneInDirectory } from "../src/pane-records.js";

test("finds the pane of a hook outside it only when one pane fits", () => {
  const one = "%1\topencode\t/srv/api\n%2\tzsh\t/srv/api\n%3\topencode\t/srv/web";
  assert.equal(paneInDirectory(one, "opencode", "/srv/api"), "%1");
  assert.equal(paneInDirectory(one, "opencode", "/srv/none"), null);
  const two = "%1\topencode\t/srv/api\n%2\topencode\t/srv/api";
  assert.equal(paneInDirectory(two, "opencode", "/srv/api"), null);
});
