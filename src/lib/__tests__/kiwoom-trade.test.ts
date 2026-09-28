import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseKiwoomAccount } from "@/lib/kiwoom/rest-trade";
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
          },
          { stk_cd: "000660", stk_nm: "SK하이닉스", rmnd_qty: "0" },
        ],
      }
    );
    assert.equal(snap.deposit, 1000000);
    assert.equal(snap.orderable, 800000);
    assert.equal(snap.positions.length, 1);
    assert.equal(snap.positions[0]!.code, "005930");
    assert.equal(snap.positions[0]!.qty, 10);
    assert.equal(snap.positions[0]!.sellableQty, 8);
    assert.equal(snap.positions[0]!.avgPrice, 70000);
    assert.equal(snap.positions[0]!.lastPrice, 71000);
    assert.equal(snap.positions[0]!.pnl, -5000);
  });
});
