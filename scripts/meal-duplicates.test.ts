import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { areDuplicateMealItems, hasDuplicateMealItems } from "../src/lib/meals";

const goiCuon = { name: "Gỏi cuốn", portionG: 100, kcal: 180, proteinG: 8, carbG: 22, fatG: 6 };

describe("duplicate meal item detection", () => {
  it("matches identical rows regardless of Vietnamese accents", () => {
    assert.equal(areDuplicateMealItems(goiCuon, { ...goiCuon, name: "  goi cuon  " }), true);
    assert.equal(hasDuplicateMealItems([goiCuon, { ...goiCuon, name: "Goi cuon" }]), true);
  });

  it("allows the same food with a different portion or nutrition", () => {
    assert.equal(areDuplicateMealItems(goiCuon, { ...goiCuon, portionG: 200, kcal: 360 }), false);
    assert.equal(hasDuplicateMealItems([goiCuon, { ...goiCuon, kcal: 220 }]), false);
  });
});
