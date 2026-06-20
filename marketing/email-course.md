# Laws of AI Agents: the 5-day (well, 5-lesson) email course

A drip sequence of 5 emails, one every 5 days. Each one delivers a single law with a real
example, builds trust, and points back to the site. Email 5 makes the paid offer for the
expanded PDF.

How to use this: paste each email into your email tool as a sequence step. Set the delay
between steps to 5 days. Subject and preview text are provided. No em dashes anywhere, on purpose.

Replace `{{FIRST_NAME}}` with your tool's merge tag, and `[PDF LINK]` with your product link
once it exists.

---

## Email 1 — sent immediately on signup

**Subject:** Most agent bugs are not the model
**Preview:** Lesson 1 of 5. The thing that is actually breaking your agent.

Hey {{FIRST_NAME}},

Welcome. Over the next few weeks I am going to send you 5 of the laws of AI agents, one every 5 days. Short, practical, and earned from actually shipping this stuff.

Here is the first one, and it is the one that saves the most wasted time.

**Law of Context Decay**
Agents fail at context, not reasoning.

Most bad outputs trace to missing, stale, or poisoned context, not a model that cannot think. The model is usually smart enough. It was just reasoning over the wrong picture of the world. Garbage context produces confident garbage, and the confidence is what makes it dangerous.

You have probably seen this: your support agent insists a cancelled subscription is still active, so the team files a ticket to upgrade to a smarter model. The real culprit is a 30-day-old cached snapshot in the retrieval pipeline. The agent reasoned perfectly over stale data.

The fix:
Before you reach for a bigger model, log the exact context the agent saw on three bad runs. You will almost always find a contradiction or a stale record, not a dumb model. Fix the freshness and the reasoning bug evaporates.

See all 50 laws here: https://laws.deleg8.dev

Talk in 5 days,
Sabir

P.S. Each law on the site links to its source. This one comes from Anthropic's writing on context engineering.

---

## Email 2 — 5 days later

**Subject:** Why your 95% agent is actually a coin flip
**Preview:** Lesson 2 of 5. Reliability does not add. It multiplies.

Hey {{FIRST_NAME}},

Lesson 2. This one is pure math, and it is brutal once you see it.

**Compounding Error Law**
Reliability multiplies, it does not add.

A step that is 95% reliable, run ten times in sequence, lands correct only about 60% of the time. The failures do not announce themselves. They accumulate quietly until the final answer is wrong and you cannot tell which step broke it.

Picture a six-step invoice pipeline: OCR, extract line items, match vendor, validate totals, post to ledger, notify. Each step tests at 95%, so you ship. Then roughly a third of invoices come out subtly wrong with no obvious culprit. That is not bad luck. 0.95 to the sixth power is about 0.74.

The fix:
Count your steps. Either collapse them, so one pass extracts and validates together, or add a checkpoint that halts on low confidence before a bad result can poison everything downstream.

The full set of reliability laws is here: https://laws.deleg8.dev

More soon,
Sabir

---

## Email 3 — 10 days after signup

**Subject:** The three powers you should never combine
**Preview:** Lesson 3 of 5. The security mistake hiding in most agents.

Hey {{FIRST_NAME}},

Lesson 3, and this is the one to share with your team.

**The Lethal Trifecta**
Private data, untrusted content, and an exfiltration path. Pick at most two.

An agent becomes exploitable the moment it combines three capabilities: access to private data, exposure to untrusted content, and the ability to communicate externally. Any single poisoned input in that pipeline can steer it into leaking your data. No code vulnerability required, because the model cannot reliably tell where an instruction came from.

Real version: your support agent reads a customer's private history, ingests an inbound email, and can call a send_email tool. That is all three legs. A request hidden in an email signature, asking it to forward another user's details to an outside address, and the agent obliges.

The fix:
You cannot prompt your way out of this. Break the chain. Make the reply tool draft-only behind human review, or strip the agent's access to private data while it is reading untrusted mail. Drop one leg and the attack has nowhere to go.

This one is credited to Simon Willison, link on the site: https://laws.deleg8.dev

Stay safe out there,
Sabir

---

## Email 4 — 15 days after signup

**Subject:** 97% accuracy is hiding something
**Preview:** Lesson 4 of 5. The metric that lies to your face.

Hey {{FIRST_NAME}},

Lesson 4. This is the one that decides whether you ship something good or something that just looks good.

**Averages Lie**
97% overall can hide a 60% segment.

An aggregate metric is a blended story that smooths over exactly the failures you most need to see. A system at 97% overall can be 99% on the easy cases and 60% on the rare, hard segment where errors actually cost you.

Concrete: your support triage classifier reports 96% accuracy, so the team greenlights auto-routing. Three weeks later the billing-dispute queue is a disaster. The model was 99% on password resets and 58% on the rare refund disputes, the exact slice the blended number hid.

The fix:
Slice the eval by type, segment, and language before you trust it. Require every slice to clear the bar, not just the average. And oversample the rare high-stakes cases instead of grading on a random draw.

All 5 evaluation laws are on the site: https://laws.deleg8.dev

One more to go,
Sabir

---

## Email 5 — 20 days after signup (the offer)

**Subject:** Give your agent a way to say I do not know
**Preview:** Lesson 5 of 5. Plus the expanded field guide.

Hey {{FIRST_NAME}},

Last lesson. This is the one that quietly prevents the most embarrassing failures.

**The Escape Hatch Law**
No clean exit means a fabricated one.

An agent with no legitimate way to say I am stuck, or hand this to a human, will invent a path instead. Cornered without an exit, or forced to fill a required field it has no answer for, it fabricates something plausible rather than admitting the gap. A confident hallucination is the default when honesty is not an option.

Example: an intake agent has a required customer_id field and no way to signal it could not find one. When a query arrives with no match, it invents a plausible looking ID and files the ticket into the wrong account.

The fix:
Always give the agent a first-class way out. A nullable field, an explicit unknown value, an escalate-to-human action it is encouraged to call. When I do not know is a valid, easy answer, you trade confident fabrications for honest gaps you can act on.

That is the 5-lesson course. If these were useful, here is the next step.

I put together the expanded field guide: all 50 laws, every one with its principle, its takeaway, a worked example like the ones in these emails, and a real source so you can go deeper. It is a clean 48-page PDF you can keep next to your keyboard and revisit the next time something breaks in a way you have seen before.

Get the expanded field guide: [PDF LINK]

Thanks for reading. Go build agents people actually trust.

Sabir

P.S. The living deck stays free and keeps growing at https://laws.deleg8.dev. The PDF is for when you want the whole thing in one place, with the examples and the receipts.
