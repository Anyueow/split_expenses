import { describe, expect, it } from "vitest";
import type { Expense, GroupData, Member } from "../src/lib/types";
import { pushActivity, ACTIVITY_LIMIT } from "../netlify/functions/_shared/activity";
import { buildExpenseCsv } from "../netlify/functions/_shared/csvExport";
import { HttpError, json, queryParam, handle } from "../netlify/functions/_shared/http";
import {
  formatMoney,
  slugify,
  validateExpenseInput,
  validateSettlementInput,
} from "../netlify/functions/_shared/validation";

const members: Member[] = [
  { id: "m-ana", name: "Ana", color: "#6C5CE7" },
  { id: "m-marcus", name: "Marcus", color: "#00B894" },
  { id: "m-priya", name: "Priya", color: "#E17055" },
];

function expenseBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    description: "Dinner at Szimpla",
    amountMinor: 4500,
    currency: "EUR",
    paidBy: "m-ana",
    splitType: "equal",
    splits: [{ memberId: "m-ana" }, { memberId: "m-marcus" }, { memberId: "m-priya" }],
    category: "food",
    date: "2026-08-14",
    ...overrides,
  };
}

function expectHttpError(fn: () => unknown, status: number, messageMatch?: RegExp): HttpError {
  let thrown: unknown;
  try {
    fn();
  } catch (err) {
    thrown = err;
  }
  expect(thrown, "expected the call to throw").toBeInstanceOf(HttpError);
  const httpError = thrown as HttpError;
  expect(httpError.status).toBe(status);
  if (messageMatch) expect(httpError.message).toMatch(messageMatch);
  return httpError;
}

describe("validateExpenseInput — happy paths", () => {
  it("accepts a well-formed equal split", () => {
    const result = validateExpenseInput(expenseBody(), members);
    expect(result.description).toBe("Dinner at Szimpla");
    expect(result.amountMinor).toBe(4500);
    expect(result.splits).toHaveLength(3);
    expect(result.note).toBeUndefined();
  });

  it("accepts percentages that add to exactly 100", () => {
    const result = validateExpenseInput(
      expenseBody({
        splitType: "percentage",
        splits: [
          { memberId: "m-ana", percentage: 50 },
          { memberId: "m-marcus", percentage: 25.5 },
          { memberId: "m-priya", percentage: 24.5 },
        ],
      }),
      members
    );
    expect(result.splitType).toBe("percentage");
    expect(result.splits.map((s) => s.percentage)).toEqual([50, 25.5, 24.5]);
  });

  it("accepts exact splits that sum to the total", () => {
    const result = validateExpenseInput(
      expenseBody({
        splitType: "exact",
        splits: [
          { memberId: "m-ana", amountMinor: 2000 },
          { memberId: "m-marcus", amountMinor: 1500 },
          { memberId: "m-priya", amountMinor: 1000 },
        ],
      }),
      members
    );
    expect(result.splits.reduce((sum, s) => sum + (s.amountMinor ?? 0), 0)).toBe(4500);
  });

  it("trims the description and keeps a non-empty note", () => {
    const result = validateExpenseInput(
      expenseBody({ description: "  Taxi  ", note: " split later " }),
      members
    );
    expect(result.description).toBe("Taxi");
    expect(result.note).toBe("split later");
  });
});

describe("validateExpenseInput — member ids", () => {
  it("rejects a payer who isn't in the group", () => {
    expectHttpError(
      () => validateExpenseInput(expenseBody({ paidBy: "m-ghost" }), members),
      400,
      /payer is not a member/i
    );
  });

  it("rejects a split referring to someone outside the group", () => {
    expectHttpError(
      () =>
        validateExpenseInput(
          expenseBody({ splits: [{ memberId: "m-ana" }, { memberId: "m-nobody" }] }),
          members
        ),
      400,
      /isn't in this group/i
    );
  });

  it("rejects a non-string member id in a split", () => {
    expectHttpError(
      () => validateExpenseInput(expenseBody({ splits: [{ memberId: 42 }] }), members),
      400
    );
  });

  it("rejects the same person appearing twice in one split", () => {
    expectHttpError(
      () =>
        validateExpenseInput(
          expenseBody({ splits: [{ memberId: "m-ana" }, { memberId: "m-ana" }] }),
          members
        ),
      400,
      /only appear once/i
    );
  });
});

describe("validateExpenseInput — amounts", () => {
  it("rejects zero and negative amounts", () => {
    for (const amountMinor of [0, -1, -4500]) {
      expectHttpError(
        () => validateExpenseInput(expenseBody({ amountMinor }), members),
        400,
        /positive whole number/i
      );
    }
  });

  it("rejects non-integer and non-numeric amounts", () => {
    for (const amountMinor of [45.5, "4500", null, undefined, NaN, Infinity]) {
      expectHttpError(
        () => validateExpenseInput(expenseBody({ amountMinor }), members),
        400,
        /positive whole number/i
      );
    }
  });
});

describe("validateExpenseInput — split totals", () => {
  it("rejects percentages that don't add to 100", () => {
    const err = expectHttpError(
      () =>
        validateExpenseInput(
          expenseBody({
            splitType: "percentage",
            splits: [
              { memberId: "m-ana", percentage: 50 },
              { memberId: "m-marcus", percentage: 30 },
            ],
          }),
          members
        ),
      400
    );
    expect(err.message).toMatch(/100%/);
  });

  it("rejects percentages that overshoot 100", () => {
    expectHttpError(
      () =>
        validateExpenseInput(
          expenseBody({
            splitType: "percentage",
            splits: [
              { memberId: "m-ana", percentage: 80 },
              { memberId: "m-marcus", percentage: 40 },
            ],
          }),
          members
        ),
      400,
      /100%/
    );
  });

  it("rejects exact splits that don't sum to the total", () => {
    expectHttpError(
      () =>
        validateExpenseInput(
          expenseBody({
            splitType: "exact",
            splits: [
              { memberId: "m-ana", amountMinor: 2000 },
              { memberId: "m-marcus", amountMinor: 2000 },
            ],
          }),
          members
        ),
      400,
      /add up to the total/i
    );
  });

  it("rejects negative exact split amounts", () => {
    expectHttpError(
      () =>
        validateExpenseInput(
          expenseBody({
            splitType: "exact",
            splits: [
              { memberId: "m-ana", amountMinor: 5000 },
              { memberId: "m-marcus", amountMinor: -500 },
            ],
          }),
          members
        ),
      400,
      /zero or more/i
    );
  });

  it("rejects an empty or missing split list", () => {
    expectHttpError(() => validateExpenseInput(expenseBody({ splits: [] }), members), 400);
    expectHttpError(() => validateExpenseInput(expenseBody({ splits: undefined }), members), 400);
    expectHttpError(() => validateExpenseInput(expenseBody({ splits: "all" }), members), 400);
  });
});

describe("validateExpenseInput — other fields", () => {
  it("rejects an empty description", () => {
    for (const description of ["", "   ", undefined, 7]) {
      expectHttpError(
        () => validateExpenseInput(expenseBody({ description }), members),
        400,
        /description is required/i
      );
    }
  });

  it("rejects a currency outside the allowed set", () => {
    for (const currency of ["JPY", "eur", "", 1]) {
      expectHttpError(
        () => validateExpenseInput(expenseBody({ currency }), members),
        400,
        /unsupported currency/i
      );
    }
  });

  it("rejects an unknown category and split type", () => {
    expectHttpError(
      () => validateExpenseInput(expenseBody({ category: "yachts" }), members),
      400,
      /category/i
    );
    expectHttpError(
      () => validateExpenseInput(expenseBody({ splitType: "shares" }), members),
      400,
      /split type/i
    );
  });

  it("rejects a missing date", () => {
    expectHttpError(() => validateExpenseInput(expenseBody({ date: "" }), members), 400, /date/i);
  });
});

describe("validateSettlementInput", () => {
  const body = {
    fromMemberId: "m-marcus",
    toMemberId: "m-ana",
    amountMinor: 2000,
    currency: "EUR",
    date: "2026-08-15",
  };

  it("accepts a valid payment", () => {
    expect(validateSettlementInput({ ...body }, members)).toEqual(body);
  });

  it("rejects a payment to oneself", () => {
    expectHttpError(
      () => validateSettlementInput({ ...body, toMemberId: "m-marcus" }, members),
      400,
      /two different people/i
    );
  });

  it("rejects unknown members", () => {
    expectHttpError(
      () => validateSettlementInput({ ...body, fromMemberId: "m-ghost" }, members),
      400,
      /members of this group/i
    );
    expectHttpError(
      () => validateSettlementInput({ ...body, toMemberId: "m-ghost" }, members),
      400,
      /members of this group/i
    );
  });

  it("rejects non-positive or fractional amounts", () => {
    for (const amountMinor of [0, -100, 12.5, "20"]) {
      expectHttpError(
        () => validateSettlementInput({ ...body, amountMinor }, members),
        400,
        /positive whole number/i
      );
    }
  });
});

describe("formatting helpers", () => {
  it("formats symbol and suffix currencies", () => {
    expect(formatMoney(4500, "EUR")).toBe("€45.00");
    expect(formatMoney(4500, "USD")).toBe("$45.00");
    expect(formatMoney(4500, "GBP")).toBe("£45.00");
    expect(formatMoney(4500, "INR")).toBe("₹45.00");
    expect(formatMoney(120000, "HUF")).toBe("1200.00 Ft");
    expect(formatMoney(999, "CZK")).toBe("9.99 Kč");
  });

  it("slugifies group names for the export filename", () => {
    expect(slugify("Budapest Trip")).toBe("budapest-trip");
    expect(slugify("  Ski / Snow 2026!  ")).toBe("ski-snow-2026");
    expect(slugify("Café Crawl")).toBe("cafe-crawl");
    expect(slugify("!!!")).toBe("group");
  });
});

describe("activity log", () => {
  it("prepends events and caps the log at the most recent 200", () => {
    const data: GroupData = {
      group: { id: "g1", name: "Trip", currency: "EUR", members, createdAt: "2026-01-01" },
      expenses: [],
      settlements: [],
      activity: [],
    };

    for (let i = 0; i < ACTIVITY_LIMIT + 25; i++) pushActivity(data, `event ${i}`);

    expect(data.activity).toHaveLength(ACTIVITY_LIMIT);
    expect(data.activity[0].message).toBe(`event ${ACTIVITY_LIMIT + 24}`);
    expect(data.activity[0].groupId).toBe("g1");
    expect(data.activity.at(-1)?.message).toBe(`event ${25}`);
  });
});

describe("CSV export", () => {
  const expenses: Expense[] = [
    {
      id: "e1",
      groupId: "g1",
      description: 'Dinner, "the good one"',
      amountMinor: 4500,
      currency: "EUR",
      paidBy: "m-ana",
      splitType: "equal",
      splits: [{ memberId: "m-ana" }, { memberId: "m-marcus" }, { memberId: "m-priya" }],
      category: "food",
      date: "2026-08-14",
      createdAt: "2026-08-14T20:00:00.000Z",
      updatedAt: "2026-08-14T20:00:00.000Z",
      note: "line1\nline2",
    },
    {
      id: "e2",
      groupId: "g1",
      description: "Taxi",
      amountMinor: 1000,
      currency: "EUR",
      paidBy: "m-marcus",
      splitType: "exact",
      splits: [
        { memberId: "m-marcus", amountMinor: 600 },
        { memberId: "m-priya", amountMinor: 400 },
      ],
      category: "transport",
      date: "2026-08-15",
      createdAt: "2026-08-15T09:00:00.000Z",
      updatedAt: "2026-08-15T09:00:00.000Z",
    },
  ];

  it("emits the contract columns plus one per member", () => {
    const out = buildExpenseCsv(members, expenses);
    const header = out.split("\r\n")[0];
    expect(header).toBe(
      "date,description,amount,currency,category,paid_by,split_type,note,Ana,Marcus,Priya"
    );
  });

  it("writes resolved shares as 2dp decimals, zero for non-participants", () => {
    const out = buildExpenseCsv(members, expenses);
    const rows = out.split("\r\n");

    // 4500 / 3 splits evenly, so every member carries 15.00.
    expect(rows[1]).toContain("15.00,15.00,15.00");
    // Ana is not in the taxi split.
    expect(rows[2]).toBe("2026-08-15,Taxi,10.00,EUR,transport,Marcus,exact,,0.00,6.00,4.00");
  });

  it("quotes fields containing commas, quotes and newlines", () => {
    const out = buildExpenseCsv(members, expenses);
    expect(out).toContain('"Dinner, ""the good one"""');
    expect(out).toContain('"line1\nline2"');
  });

  it("disambiguates duplicate member names in the header", () => {
    const dupes: Member[] = [
      { id: "a", name: "Sam", color: "#000" },
      { id: "b", name: "Sam", color: "#111" },
    ];
    expect(buildExpenseCsv(dupes, []).split("\r\n")[0]).toMatch(/Sam,Sam \(2\)$/);
  });
});

describe("http helpers", () => {
  it("turns an HttpError into its own status and message", async () => {
    const wrapped = handle(async () => {
      throw new HttpError(404, "Group not found");
    });
    const res = await wrapped(new Request("https://example.test/x"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Group not found" });
  });

  it("hides unexpected errors behind a generic 500", async () => {
    const wrapped = handle(async () => {
      throw new Error("connection string postgres://secret@host");
    });
    const res = await wrapped(new Request("https://example.test/x"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal error" });
  });

  it("reads query params and treats blanks as absent", () => {
    const req = new Request("https://example.test/x?groupId=g1&expenseId=");
    expect(queryParam(req, "groupId")).toBe("g1");
    expect(queryParam(req, "expenseId")).toBeUndefined();
    expect(queryParam(req, "missing")).toBeUndefined();
  });

  it("sets JSON content type and no-store", () => {
    const res = json({ ok: true });
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
});
