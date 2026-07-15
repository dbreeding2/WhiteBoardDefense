# WhiteBoardDefense -- Instructor Guide

## What this tool does

WhiteBoardDefense runs a structured oral defense for a student's paper,
project, or presentation. It:
1. Generates 8 questions grounded in the specific content the student submitted.
2. Lets you review/edit those questions before the live session.
3. Runs a live, synced whiteboard + AI-assisted follow-up chat with the student.
4. Produces a final integrity/mastery report (on-screen and as a downloadable PDF).

---

## 1. Starting a new defense

1. Open `https://<server-address>:3456` in your browser (your IT contact/admin
   will give you the exact address). You'll see a "Not secure" warning the
   first time -- this is expected (self-signed certificate); click through it
   ("Advanced" -> "Proceed").
2. On the setup screen, fill in:
   - Student name
   - Paper/submission title
   - Course name
   - **Activity type** -- Research Paper, Project, or Presentation. This
     changes what the compliance checklist and questions focus on, so set it
     correctly.
   - Paste in the submission's text content.
3. Click generate -- 8 questions will be produced, grounded in the actual
   content submitted (not generic templates).

## 2. Reviewing questions

Before the live session, you can:
- Edit any question's wording directly.
- Regenerate a specific question with custom instructions (e.g. "focus more on
  the methodology section").
- Review the **Manuscript Analyzer** panel alongside the questions -- this
  shows word count, readability, a compliance checklist appropriate to the
  activity type, an AI-authorship signature check, flagged conceptual
  weaknesses, and extracted references. Use this as a first-pass sanity check
  before the live defense, not a final verdict.

## 3. Running the live session

1. Click **Launch Active Synced Session**. This generates a share link and QR
   code.
2. Send the link (or show the QR code) to the student. Remind them they'll see
   a one-time browser security warning -- it's expected (see the Student
   Guide).
3. The student works through the whiteboard/diagram questions, then moves into
   an AI-moderated oral follow-up chat.
4. If you're running multiple sessions at once, the **Instructor Dashboard**
   (`?dashboard=true` on the same base URL) shows all active sessions, their
   current question/stage, and live thumbnails.

### Assessment mode
You can choose **AI-assisted** scoring (the default) or switch to fully manual
**instructor** scoring if you'd rather grade the transcript yourself.

## 4. Reading the final report

The final scorecard includes:
- **Overall Understanding Mastery** (0-100) and a recommended letter grade.
- **AI-Generated / Ghostwriting Suspicion Level** (Low/Medium/High) with a
  one-line rationale. This is a signal to investigate further, not an
  automatic accusation -- always use your judgment alongside it.
- Category breakdown: Technical Mastery, Whiteboard Synthesis, Integrity
  Verification.
- Strengths and gaps identified from the actual transcript.
- Per-question diagram/answer evaluations with pass/fail checks and specific
  missing concepts.

Click **Export Full Academic Defense PDF** to save a complete record,
including whiteboard snapshots -- useful for your own records or an academic
integrity review.

## 5. A few things worth knowing

- **Suspicion scoring looks for concrete artifacts** (literal ASCII-art box
  diagrams pasted into answers, AI-assistant phrasing like "Great question!",
  near-identical repeated wording) -- not just long or well-organized answers.
  A thorough, well-prepared student should not be penalized just for writing
  clearly.
- **A refresh won't lose a session.** In-progress and completed sessions are
  now saved automatically in the browser and restore themselves if the page
  reloads or the connection drops -- you don't need to re-run the whole
  defense if that happens.
- **Presentation and Project activity types** use different compliance
  criteria than a Research Paper (e.g. checking for an objective/visuals/
  conclusion, or requirements/architecture/test-plan, instead of
  abstract/methodology/citations) -- make sure you picked the right activity
  type at setup, since it changes what gets checked.

## 6. If something looks wrong

If a report seems off (wrong compliance checks for the activity type, PDF
layout issues, missing snapshots, etc.), note the session ID and what you
expected vs. what you saw, and pass it along to whoever maintains the
platform for you.
