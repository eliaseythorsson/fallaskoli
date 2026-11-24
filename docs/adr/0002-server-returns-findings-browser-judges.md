# For server-graded questions the server returns findings, the browser judges

The server's text reader (GreynirCorrect, Claude) returns only checked findings, each quoting the pupil's text; right/wrong and XP are decided by the same `judge` → `settle` path as every other question, in the browser. We chose this over a server-side verdict so that there is one answer path for every question type, and XP, word knowledge, badges and the review queue cannot drift apart between two graders.
