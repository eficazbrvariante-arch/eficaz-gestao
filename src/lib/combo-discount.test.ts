import { describe, expect, it } from "vitest";
import {
  DEFAULT_COMBO_DISCOUNT_SETTINGS,
  classifyComboItem,
  computeComboDiscount,
  normalizeProductText,
  parseComboDiscountSettings,
  type ComboDiscountSettings,
} from "./combo-discount";

const settings = DEFAULT_COMBO_DISCOUNT_SETTINGS;

describe("normalizeProductText", () => {
  it("tira acento e caixa", () => {
    expect(normalizeProductText("Película Hidrogél")).toBe("pelicula hidrogel");
    expect(normalizeProductText("CAPINHA ANTI-IMPACTO")).toBe("capinha anti-impacto");
  });

  it("preserva dígitos e letras que já foram apagados por uma regex errada de acentos", () => {
    // Regressão: um range mal escrito comia os caracteres 0, 3, 6 e f.
    expect(normalizeProductText("Capinha iPhone 16 Pro 360 fosca")).toBe(
      "capinha iphone 16 pro 360 fosca"
    );
  });
});

describe("classifyComboItem", () => {
  it("reconhece capinha por qualquer das palavras configuradas", () => {
    expect(classifyComboItem("Capinha Silicone iPhone 15", settings)).toBe("capinha");
    expect(classifyComboItem("Capa Space Samsung A54", settings)).toBe("capinha");
  });

  it("reconhece hidrogel com e sem acento", () => {
    expect(classifyComboItem("Película Hidrogel Motorola", settings)).toBe("hidrogel");
    expect(classifyComboItem("Pelicula Hidrogél Xiaomi", settings)).toBe("hidrogel");
  });

  it("não confunde palavra parcial", () => {
    // "capa" não pode bater em "capacete"/"capacitor" — daria desconto errado.
    expect(classifyComboItem("Capacete para moto", settings)).toBeNull();
    expect(classifyComboItem("Capacitor 100uF", settings)).toBeNull();
  });

  it("exclusão vence, mesmo quando o nome também casa hidrogel", () => {
    expect(classifyComboItem("Película 3D Hidrogel", settings)).toBeNull();
    expect(classifyComboItem("Película de Vidro Temperado", settings)).toBeNull();
    expect(classifyComboItem("Película Cerâmica Fosca", settings)).toBeNull();
    expect(classifyComboItem("Pelicula Ceramica Fosca", settings)).toBeNull();
  });

  it("exclusão também derruba capinha", () => {
    expect(classifyComboItem("Capinha 3D Premium", settings)).toBeNull();
  });

  it("ignora produto que não é nem um nem outro", () => {
    expect(classifyComboItem("Carregador Turbo 20W", settings)).toBeNull();
    expect(classifyComboItem("", settings)).toBeNull();
  });
});

describe("computeComboDiscount", () => {
  it("um par forma um combo", () => {
    const result = computeComboDiscount(
      [
        { name: "Capinha Silicone", quantity: 1 },
        { name: "Película Hidrogel", quantity: 1 },
      ],
      settings
    );
    expect(result.combos).toBe(1);
    expect(result.amount).toBe(15);
  });

  it("dois pares formam dois combos", () => {
    const result = computeComboDiscount(
      [
        { name: "Capinha Silicone", quantity: 2 },
        { name: "Película Hidrogel", quantity: 2 },
      ],
      settings
    );
    expect(result.combos).toBe(2);
    expect(result.amount).toBe(30);
  });

  it("usa o MENOR dos dois lados — sobra não vira desconto", () => {
    const result = computeComboDiscount(
      [
        { name: "Capinha Silicone", quantity: 5 },
        { name: "Película Hidrogel", quantity: 2 },
      ],
      settings
    );
    expect(result.combos).toBe(2);
    expect(result.amount).toBe(30);
    expect(result.capinhaUnits).toBe(5);
    expect(result.hidrogelUnits).toBe(2);
  });

  it("sem par não há desconto", () => {
    expect(
      computeComboDiscount([{ name: "Capinha Silicone", quantity: 3 }], settings).amount
    ).toBe(0);
    expect(
      computeComboDiscount([{ name: "Película Hidrogel", quantity: 3 }], settings).amount
    ).toBe(0);
  });

  it("película 3D não forma combo com capinha", () => {
    const result = computeComboDiscount(
      [
        { name: "Capinha Silicone", quantity: 1 },
        { name: "Película 3D", quantity: 1 },
      ],
      settings
    );
    expect(result.amount).toBe(0);
  });

  it("soma unidades espalhadas em linhas diferentes", () => {
    const result = computeComboDiscount(
      [
        { name: "Capinha Silicone iPhone", quantity: 1 },
        { name: "Capa Space Samsung", quantity: 1 },
        { name: "Película Hidrogel Motorola", quantity: 3 },
      ],
      settings
    );
    expect(result.combos).toBe(2);
    expect(result.amount).toBe(30);
  });

  it("quantidade zero, negativa ou quebrada não conta", () => {
    const result = computeComboDiscount(
      [
        { name: "Capinha Silicone", quantity: 0 },
        { name: "Película Hidrogel", quantity: -2 },
      ],
      settings
    );
    expect(result.amount).toBe(0);
  });

  it("valor por combo zerado desliga a regra", () => {
    const off: ComboDiscountSettings = { ...settings, amountPerCombo: 0 };
    const result = computeComboDiscount(
      [
        { name: "Capinha Silicone", quantity: 1 },
        { name: "Película Hidrogel", quantity: 1 },
      ],
      off
    );
    expect(result.amount).toBe(0);
  });

  it("respeita palavras-chave customizadas pela empresa", () => {
    const custom: ComboDiscountSettings = {
      capinhaKeywords: ["case"],
      hidrogelKeywords: ["gel"],
      excludeKeywords: [],
      amountPerCombo: 10,
    };
    const result = computeComboDiscount(
      [
        { name: "Case Transparente", quantity: 1 },
        { name: "Pelicula Gel", quantity: 1 },
      ],
      custom
    );
    expect(result.combos).toBe(1);
    expect(result.amount).toBe(10);
  });
});

describe("parseComboDiscountSettings", () => {
  it("volta ao padrão quando não há nada salvo", () => {
    expect(parseComboDiscountSettings(null)).toEqual(DEFAULT_COMBO_DISCOUNT_SETTINGS);
    expect(parseComboDiscountSettings(undefined)).toEqual(DEFAULT_COMBO_DISCOUNT_SETTINGS);
    expect(parseComboDiscountSettings("texto solto")).toEqual(DEFAULT_COMBO_DISCOUNT_SETTINGS);
    expect(parseComboDiscountSettings([1, 2])).toEqual(DEFAULT_COMBO_DISCOUNT_SETTINGS);
  });

  it("lê o que foi configurado", () => {
    expect(
      parseComboDiscountSettings({
        capinhaKeywords: ["case", "capinha"],
        hidrogelKeywords: ["hidrogel"],
        excludeKeywords: ["3d"],
        amountPerCombo: 20,
      })
    ).toEqual({
      capinhaKeywords: ["case", "capinha"],
      hidrogelKeywords: ["hidrogel"],
      excludeKeywords: ["3d"],
      amountPerCombo: 20,
    });
  });

  it("aceita lista de exclusão vazia como intenção real", () => {
    const parsed = parseComboDiscountSettings({ excludeKeywords: [] });
    expect(parsed.excludeKeywords).toEqual([]);
  });

  it("campo corrompido cai no padrão em vez de derrubar o PDV", () => {
    const parsed = parseComboDiscountSettings({
      capinhaKeywords: "capinha",
      amountPerCombo: "muito",
    });
    expect(parsed.capinhaKeywords).toEqual(DEFAULT_COMBO_DISCOUNT_SETTINGS.capinhaKeywords);
    expect(parsed.amountPerCombo).toBe(DEFAULT_COMBO_DISCOUNT_SETTINGS.amountPerCombo);
  });

  it("descarta entradas em branco e apara espaços", () => {
    const parsed = parseComboDiscountSettings({
      capinhaKeywords: ["  capinha  ", "", "   ", 42],
    });
    expect(parsed.capinhaKeywords).toEqual(["capinha"]);
  });

  it("valor negativo cai no padrão", () => {
    expect(parseComboDiscountSettings({ amountPerCombo: -5 }).amountPerCombo).toBe(15);
  });
});
