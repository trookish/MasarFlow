/**
 * POST /api/opencode/question — answer or reject an opencode `question`
 * request (the AI used its `question` tool and is waiting on the user).
 *
 * Body: { requestId, action: "reply" | "reject", answers?: string[][] }
 *   - reply  → answers is one entry per asked question, each an array of
 *     selected labels (matches opencode's QuestionReply wire format).
 *   - reject → the question is dismissed unanswered and the turn continues.
 */

import { badRequest, client, logRequest, errorResponse } from "../_shared";

const QUESTION_ID_RE = /^que[A-Za-z0-9_-]{0,64}$/;
const MAX_QUESTIONS = 10;
const MAX_ANSWER_LEN = 500;

export async function POST(req: Request): Promise<Response> {
  let body: { requestId?: string; action?: string; answers?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid request body");
  }
  if (!body.requestId || !QUESTION_ID_RE.test(body.requestId)) {
    return badRequest("Missing or invalid requestId");
  }
  if (body.action !== "reply" && body.action !== "reject") {
    return badRequest('action must be "reply" or "reject"');
  }
  if (body.action === "reply") {
    if (!Array.isArray(body.answers)) {
      return badRequest("answers is required for reply");
    }
    if (
      body.answers.length > MAX_QUESTIONS ||
      body.answers.some(
        (a) =>
          !Array.isArray(a) ||
          a.some(
            (label) =>
              typeof label !== "string" || label.length > MAX_ANSWER_LEN,
          ),
      )
    ) {
      return badRequest("Invalid answers payload");
    }
  }

  const requestId = `question_${crypto.randomUUID().slice(0, 8)}`;
  const answers = body.action === "reply" ? (body.answers as string[][]) : null;
  logRequest(requestId, "question reply", {
    questionId: body.requestId,
    action: body.action,
    answers: answers?.length ?? 0,
  });

  try {
    const ok =
      body.action === "reply"
        ? await client().replyQuestion(body.requestId, answers!)
        : await client().rejectQuestion(body.requestId);
    logRequest(requestId, "question sent", { questionId: body.requestId, ok });
    return Response.json({ ok });
  } catch (e) {
    return errorResponse(e, requestId, (m, x) => logRequest(requestId, m, x));
  }
}
