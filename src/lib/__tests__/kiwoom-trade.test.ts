import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kiwoomNeedsIpRegistration } from "@/lib/kiwoom/quote-rest";
import {
  accountEstimatedAssets,
  formatKiwoomAccountNo,
  krwToUsd,
  mergeAccountSnapshots,
  parseKiwoomAccount,
  parseUsLedger,
  parseUsValuation,
} from "@/lib/kiwoom/rest-trade";
import { bracketAction } from "@/lib/kiwoom/brackets";
import { buildScaleInOrders, krxTickSize, roundToTick } from "@/lib/kiwoom/scale-plan";

describe("krx ticks", () => {
  it("uses the wider tick on each boundary", () => {
    assert.equal(krxTickSize(1999), 1);
    assert.equal(krxTickSize(2000), 5);
    assert.equal(krxTickSize(5000), 10);
    assert.equal(krxTickSize(20000), 50);
    assert.equal(krxTickSize(50000), 100);
    assert.equal(krxTickSize(200000), 500);
    assert.equal(krxTickSize(500000), 1000);
    assert.equal(roundToTick(74820), 74800);
  });
});

describe("scale-in ladder", () => {
  it("spaces ticks evenly and gives the remainder to higher prices", () => {
    const slices = buildScaleInOrders(10000, 10100, 3, 10);
    assert.deepEqual(
      slices.map((s) => s.price),
      [10100, 10050, 10000]
    );
    assert.deepEqual(
      slices.map((s) => s.qty),
      [4, 3, 3]
    );
    assert.equal(
      slices.reduce((sum, s) => sum + s.qty, 0),
      10
    );
  });

  it("rejects a band that cannot hold the split count", () => {
    assert.throws(() => buildScaleInOrders(10000, 10010, 5, 5), /호가/);
    assert.throws(() => buildScaleInOrders(10000, 10100, 1, 4), /2에서 20/);
    assert.throws(() => buildScaleInOrders(10000, 10100, 4, 3), /수량/);
  });
});

describe("bracket trigger", () => {
  const bracket = { armed: true, firing: false, takeProfit: 80000, stopLoss: 70000 };

  it("sells the stop before the target when a print gaps through both", () => {
    assert.equal(bracketAction(69000, bracket), "stop");
    assert.equal(bracketAction(81000, bracket), "take");
    assert.equal(bracketAction(75000, bracket), null);
    assert.equal(bracketAction(69000, { ...bracket, firing: true }), null);
  });
});

describe("merged balances", () => {
  it("keeps an NXT holding when the KRX book is empty and ignores a zero deposit", () => {
    const empty = parseKiwoomAccount(
      { entr: "0", d2_entra: "50000" },
      { tot_evlt_amt: "0", tot_prft_rt: "0.00", acnt_evlt_remn_indv_tot: [] }
    );
    const nxt = parseKiwoomAccount(
      { entr: "0" },
      {
        dmst_stex_tp: "NXT",
        tot_pur_amt: "100000",
        tot_evlt_amt: "110000",
        acnt_evlt_remn_indv_tot: [
          {
            stk_cd: "A005930",
            stk_nm: "삼성전자",
            rmnd_qty: "2",
            pur_pric: "50000",
            cur_prc: "55000",
          },
        ],
      }
    );
    assert.equal(empty.deposit, 50000);
    const merged = mergeAccountSnapshots([empty, nxt]);
    assert.equal(merged.positions.length, 1);
    assert.equal(merged.positions[0]!.qty, 2);
    assert.equal(merged.deposit, 50000);
    assert.equal(merged.summary.evaluation, 110000);
  });
});

describe("account number", () => {
  it("splits the product code off the 10-digit ka00001 value", () => {
    assert.equal(formatKiwoomAccountNo("5842074010"), "5842-0740 위탁종합");
    assert.equal(formatKiwoomAccountNo("5842-0740"), "5842-0740");
    assert.equal(formatKiwoomAccountNo("5842074011"), "5842-0740-11");
  });
});

describe("us ledger", () => {
  it("keeps dollar prices and rolls the won total into the account", () => {
    const domestic = parseKiwoomAccount({ entr: "0" }, { acnt_evlt_remn_indv_tot: [] });
    const us = parseUsLedger({
      tot_prch_amt_krw: "13590000",
      tot_evlt_amt_krw: "14000000",
      tot_pl_amt_krw: "410000",
      tot_pl_rt: "3.02",
      result_list: [
        {
          crnc_code: "USD",
          stk_cd: "TSLA",
          frgn_stk_nm: "테슬라",
          poss_qty: "10",
          sell_alowq: "10",
          frgn_stk_book_uv: "300.00",
          now_pric: "372.11",
          frgn_stk_book_amt: "3000.00",
          evlt_amt: "3721.10",
          pl_amt: "721.10",
          pl_rt: "24.03",
          frgn_stk_book_amt_krw: "4080000",
          evlt_amt_krw: "5060000",
          pl_amt_krw: "980000",
          exch_rate: "1360.00",
        },
        { stk_cd: "AAPL", poss_qty: "0" },
      ],
    });
    const cash = parseUsValuation({
      won_entr: "0",
      aset_evlt_amt: "19000000",
      result_list: [{ crnc_code: "USD", fx_entr: "1500.25", evlt_amt: "3721.10", crnc_rt: "1360" }],
    });
    assert.equal(us.positions.length, 1);
    assert.equal(us.positions[0]!.code, "TSLA");
    assert.equal(us.positions[0]!.currency, "USD");
    assert.equal(us.positions[0]!.avgPrice, 300);
    assert.equal(us.positions[0]!.lastPrice, 372.11);
    const merged = mergeAccountSnapshots([domestic, us, cash]);
    assert.equal(merged.positions.length, 1);
    assert.equal(merged.summary.evaluation, 14000000);
    assert.equal(merged.summary.purchase, 13590000);
    assert.equal(merged.summary.estimatedAssets, 19000000);
    assert.equal(merged.fxCash[0]!.deposit, 1500.25);
    assert.ok(Math.abs(merged.positions[0]!.weightPct! - (5_060_000 / 14_000_000) * 100) < 1e-6);
  });
});

describe("won and dollar totals", () => {
  it("converts won with the dollar rate and prefers the broker asset total", () => {
    assert.equal(krwToUsd(1_400_000, 1400), 1000);
    assert.equal(krwToUsd(null, 1400), null);
    assert.equal(accountEstimatedAssets(1000, 2000, 9000), 9000);
    assert.equal(accountEstimatedAssets(1000, 2000, null), 3000);
  });
});

describe("kiwoom IP allowlist", () => {
  it("recognizes the 8050 registration failure", () => {
    assert.equal(
      kiwoomNeedsIpRegistration(
        "인증에 실패했습니다[8050:IP가 등록되지 않았습니다. 키움 REST API 홈페이지 > API 사용신청 화면에서 IP를 등록해주세요.]"
      ),
      true
    );
    assert.equal(kiwoomNeedsIpRegistration("종목코드를 확인하세요"), false);
  });
});

describe("account parse", () => {
  it("reads deposit, orderable cash, and the position list", () => {
    const snap = parseKiwoomAccount(
      { entr: "1000000", ord_alow_amt: "800000", return_code: 0 },
      {
        acnt_evlt_remn_indv_tot: [
          {
            stk_cd: "A005930",
            stk_nm: "삼성전자",
            rmnd_qty: "10",
            trde_able_qty: "8",
            pur_pric: "+70000",
            cur_prc: "-71000",
            evltv_prft: "-5000",
            prft_rt: "+99.00",
          },
          { stk_cd: "000660", stk_nm: "SK하이닉스", rmnd_qty: "0" },
          {
            stk_cd: "035420",
            stk_nm: "NAVER",
            rmnd_qty: "2",
            pur_pric: "200000",
            prft_rt: "-3.50",
            evltv_prft: "-4000",
          },
        ],
        tot_pur_amt: "900000",
        tot_evlt_amt: "910000",
        tot_prft_rt: "+1.11",
      }
    );
    assert.equal(snap.deposit, 1000000);
    assert.equal(snap.orderable, 800000);
    assert.equal(snap.positions.length, 2);
    assert.equal(snap.positions[0]!.code, "005930");
    assert.equal(snap.positions[0]!.qty, 10);
    assert.equal(snap.positions[0]!.sellableQty, 8);
    assert.equal(snap.positions[0]!.avgPrice, 70000);
    assert.equal(snap.positions[0]!.lastPrice, 71000);
    assert.equal(snap.positions[0]!.pnl, 10000);
    assert.equal(snap.positions[0]!.purchaseAmount, 700000);
    assert.equal(snap.positions[0]!.evalAmount, 710000);
    assert.ok(Math.abs(snap.positions[0]!.weightPct! - (710000 / 910000) * 100) < 1e-9);
    assert.ok(Math.abs(snap.positions[0]!.returnPct! - (1000 / 70000) * 100) < 1e-9);
    assert.equal(snap.positions[1]!.returnPct, -3.5);
    assert.equal(snap.positions[1]!.lastPrice, null);
    assert.equal(snap.positions[1]!.pnl, -4000);
    assert.equal(snap.positions[1]!.purchaseAmount, 400000);
    assert.equal(snap.positions[1]!.evalAmount, null);
    assert.equal(snap.summary.purchase, 900000);
    assert.equal(snap.summary.evaluation, 910000);
    assert.equal(snap.summary.estimatedAssets, 1910000);
    assert.ok(Math.abs(snap.summary.returnPct! - (10000 / 900000) * 100) < 1e-9);
  });
});
