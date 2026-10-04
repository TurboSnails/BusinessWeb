import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { it, expect } from "vitest";
import Results from "./Results";
import fixture from "../../features/valuation/report.fixture.json";
import { importReport } from "../../features/valuation";
it("recalculates scenario prices from user assumptions and retains financial facts", () => {
  const original = importReport(JSON.stringify(fixture));
  let latest = original;
  function Workbench() {
    const [report, setReport] = useState(original);
    return (
      <Results
        report={report}
        onChange={(r) => {
          latest = r;
          setReport(r);
        }}
      />
    );
  }
  render(<Workbench />);
  fireEvent.change(screen.getByLabelText("预测 EPS"), {
    target: { value: "10" },
  });
  fireEvent.change(screen.getByLabelText("目标 P/E"), {
    target: { value: "20" },
  });
  expect(latest.results.base.pe.price).toBe(200);
  expect(latest.snapshot).toEqual(original.snapshot);
  fireEvent.click(screen.getByLabelText("P/E 市盈率适用"));
  expect(latest.results.base.pe.status).toBe("notApplicable");
});
