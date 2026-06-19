// src/formulas.js
import { state } from './state.js';

export function colLetter(c) {
  return c < 26 
    ? String.fromCharCode(65 + c) 
    : String.fromCharCode(64 + Math.floor(c / 26)) + String.fromCharCode(65 + (c % 26));
}

export function cellKey(r, c) {
  return colLetter(c) + (r + 1);
}

export function parseCellKey(key) {
  const m = key.match(/^([A-Z]+)(\d+)$/);
  if (!m) return [0, 0];
  const colStr = m[1];
  const row = parseInt(m[2]) - 1;
  let col = 0;
  for (let i = 0; i < colStr.length; i++) {
    col = col * 26 + (colStr.charCodeAt(i) - 64);
  }
  return [row, col - 1];
}

export function resolveValue(val) {
  if (val === undefined || val === null) return '';
  if (!String(val).startsWith('=')) return val;
  const formula = String(val).slice(1).toUpperCase().trim();

  // 1. SUM(A1:B3)
  const sumMatch = formula.match(/^SUM\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
  if (sumMatch) {
    return sumRange(sumMatch[1], sumMatch[2]);
  }

  // 2. AVERAGE(A1:B3)
  const avgMatch = formula.match(/^AVERAGE\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
  if (avgMatch) {
    return avgRange(avgMatch[1], avgMatch[2]);
  }

  // 3. COUNT(A1:B3)
  const countMatch = formula.match(/^COUNT\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
  if (countMatch) {
    return countRange(countMatch[1], countMatch[2]);
  }

  // 4. MAX(A1:B3)
  const maxMatch = formula.match(/^MAX\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
  if (maxMatch) {
    return maxRange(maxMatch[1], maxMatch[2]);
  }

  // 5. MIN(A1:B3)
  const minMatch = formula.match(/^MIN\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
  if (minMatch) {
    return minRange(minMatch[1], minMatch[2]);
  }

  // 6. IF(test, true_val, false_val)
  if (formula.startsWith('IF(') && formula.endsWith(')')) {
    const inner = formula.slice(3, -1);
    const parts = splitFormulaArgs(inner);
    if (parts.length === 3) {
      const testExpr = parts[0].trim();
      const trueVal = parts[1].trim();
      const falseVal = parts[2].trim();
      
      const evaluatedTest = evaluateLogicalExpr(testExpr);
      return evaluatedTest ? resolveValue('=' + trueVal) : resolveValue('=' + falseVal);
    }
  }

  // 7. Simple cell ref like =A1
  const refMatch = formula.match(/^([A-Z]+\d+)$/);
  if (refMatch) {
    const c = state.cells[refMatch[1]];
    return c ? resolveValue(c.value) : 0;
  }

  // 8. Arithmetic
  try {
    const expr = formula.replace(/([A-Z]+\d+)/g, (ref) => {
      const c = state.cells[ref];
      const v = c ? resolveValue(c.value) : 0;
      return isNaN(Number(v)) ? 0 : Number(v);
    });
    const result = Function('"use strict"; return (' + expr + ')')();
    return typeof result === 'number' ? Math.round(result * 1e10) / 1e10 : result;
  } catch {
    return '#ERROR!';
  }
}

// Extract numeric values from a cell range
export function getRangeValues(from, to) {
  const [r1, c1] = parseCellKey(from);
  const [r2, c2] = parseCellKey(to);
  
  const values = [];
  const startR = Math.min(r1, r2);
  const endR = Math.max(r1, r2);
  const startC = Math.min(c1, c2);
  const endC = Math.max(c1, c2);

  for (let r = startR; r <= endR; r++) {
    for (let c = startC; c <= endC; c++) {
      const v = state.cells[cellKey(r, c)]?.value;
      const resolved = resolveValue(v);
      const n = Number(resolved);
      if (!isNaN(n) && resolved !== '') {
        values.push(n);
      }
    }
  }
  return values;
}

export function sumRange(from, to) {
  const vals = getRangeValues(from, to);
  return vals.reduce((acc, v) => acc + v, 0);
}

export function avgRange(from, to) {
  const vals = getRangeValues(from, to);
  if (vals.length === 0) return 0;
  return Math.round((vals.reduce((acc, v) => acc + v, 0) / vals.length) * 1e10) / 1e10;
}

export function countRange(from, to) {
  return getRangeValues(from, to).length;
}

export function maxRange(from, to) {
  const vals = getRangeValues(from, to);
  return vals.length > 0 ? Math.max(...vals) : 0;
}

export function minRange(from, to) {
  const vals = getRangeValues(from, to);
  return vals.length > 0 ? Math.min(...vals) : 0;
}

// Split arguments of a formula like IF by comma, avoiding comma inside parentheses
function splitFormulaArgs(str) {
  const args = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    
    if (char === ',' && depth === 0) {
      args.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  args.push(current);
  return args;
}

// Evaluate logical expressions for IF formulas, replacing cell refs with resolved values
function evaluateLogicalExpr(expr) {
  try {
    const parsedExpr = expr.replace(/([A-Z]+\d+)/g, (ref) => {
      const c = state.cells[ref];
      const v = c ? resolveValue(c.value) : 0;
      return isNaN(Number(v)) ? `"${String(v).replace(/"/g, '\\"')}"` : Number(v);
    });
    
    // Evaluate standard JS comparison operators
    const result = Function('"use strict"; return (' + parsedExpr + ')')();
    return !!result;
  } catch {
    return false;
  }
}
