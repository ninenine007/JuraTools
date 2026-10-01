# แบบ อ.ส.4 for a share transfer instrument — guide for an AI

**For an AI filling the Revenue Department's form อ.ส.4 (แบบขอเสียอากรแสตมป์เป็นตัวเงิน)
for a SHARE TRANSFER INSTRUMENT ONLY** — not for leases, hire of work, loans or any other
instrument, whose rate, payer and deadline differ. Through the MCP tool
`create_os4_share_transfer`, or as JSON pasted into the JuraTools page
`document-automation/os4-share-transfer.html` (วาง JSON จาก AI). Both take the same object.

อ.ส.4 is how the duty on an instrument is paid **in cash** at a สำนักงานสรรพากรพื้นที่สาขา
instead of affixing stamps; the office then endorses the instrument (อ.ส.5), so the
instrument does not carry a “(ปิดอากรแสตมป์ … บาท)” line. The tool fills the RD's own
PDF, untouched, and works out the duty itself — **never calculate it yourself**.

## The object

```jsonc
{
  "transferor": {                                   // ผู้โอน
    "name": "นายสมมุติ ตัวอย่าง",                     // with the title; a foreigner's English name in CAPITALS
    "tin": "1234567890121",                          // 13 digits: ID card no. / a Thai company's registration no.
                                                     // "none" if the party has no Thai tax ID (prints 0 0000 00000 00 0)
    "branch": "00000",                               // สาขาที่ — optional; the firm leaves it blank
    "address": "10 ซอยสมมุติ 3 ถนนตัวอย่าง แขวงทดสอบ เขตทดลอง กรุงเทพมหานคร 10500"
                                                     // one Thai line → split into the form's 13 boxes (reported),
                                                     // or the boxes: {building, room, floor, village, no, moo,
                                                     //   soi, yaek, road, subdistrict, district, province, postcode}
  },
  "transferee": { … },                              // ผู้รับโอน — the same keys
  "instrument": { "date": "2026-03-02" },           // ลงวันที่ — the day the instrument was made
  "shares": { "count": 12500, "parValue": 100, "paidUpPercent": 100, "price": 1875000 },
                                                     // or "pricePerShare"; leave the price out if the instrument states none
  "office": "บางรัก",                                // สำนักงานสรรพากรพื้นที่สาขา — the words after "สาขา"
  "filingDate": "2026-03-02",                       // the day it is filed; "2026-03" leaves the day blank; omit = all blank
  "payer": "transferor",                            // "transferor" (default) | "transferee" | "split"
  "counterparts": 1,                                // duplicates made — the firm's instrument has one
  "signer": { "name": "…", "position": "…" },       // omit name → the payer's own name when a person; blank for a company
  "endorsement": { "submitted": true },             // default: the instrument is handed in to be endorsed
  "output": "fillable",                             // MCP only: "fillable" (default — editable) | "print" | "both"
  "dryRun": true                                    // MCP only: work it out, print nothing
}
```

Rarely needed: `value` (override มูลค่าของตราสาร), `duty.original` / `duty.counterpart`,
`surcharge.mode` / `.original` / `.counterpart`, `instrument.description` (default
ตราสารการโอนหุ้น), `options` (filling style — the defaults are the firm's), `fileName`.

## What the tool works out

- **Item 2** — 1 baht per 1,000 baht **or part of 1,000**, on the paid-up value of the
  shares (count × par × paid-up %) or the price in the instrument, **whichever is
  greater**. Rounded up: 2,845,316.40 → 2,846 (not 2,845.32). That basis is also what
  goes in มูลค่าของตราสาร.
- **Item 23** — each duplicate: 1 baht if the original's duty is 5 or less, else 5.
- **เงินเพิ่มอากร (ม.113)** from `instrument.date` and `filingDate`: within 15 days none;
  over 15 up to 90 days 2× (at least 4 baht); over 90 days 5× (at least 10) — per row.
  A share transfer instrument is due "ก่อนกระทำ หรือในทันทีที่ทำตราสาร".

## Who pays

| payer | forms | ผู้เสียอากร / คู่สัญญา | when |
|---|---|---|---|
| `transferor` | one, rows 2 + 23 | ผู้โอน / ผู้รับโอน | default — the firm's practice; the RD guide's example 2 (one side pays all) |
| `transferee` | one, rows 2 + 23 | ผู้รับโอน / ผู้โอน | the parties agreed the buyer pays, or the transferor is foreign with no Thai tax ID |
| `split` | two: row 2 by the transferor, row 23 by the transferee | each as payer on its own form | the RD's table: where there is another party, that party pays the duplicate's duty |

## Rules

- Dates `YYYY-MM-DD`, Christian era. A Buddhist-era year in full is converted and
  reported; a two-digit year is refused.
- Never guess a tax ID, an address, the RD office or the signer — leave it out: it
  prints blank for the lawyer to write in, and the tool lists every blank.
- A check-digit failure on a tax ID is a warning, not a refusal — show it to the lawyer.
- Read back the address split (`notes`) — a Thai address the splitter cannot place
  is reported in `warnings`; send it as boxes instead.
- Personal data only from the lawyer's documents.
- After `calculate_share_transfer`, each transfer's `os4Input` is this object with the
  names, tax IDs (from the dossier's people), addresses, date and shares filled in.
- The result is a draft: the lawyer checks it before it is signed and filed.
