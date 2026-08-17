import {
  CANONICALIZATION_VERSION,
  TRACKING_PARAMETERS_V1,
  canonicalizeDocumentUrl,
  createDocumentKey,
  createEvaluationQueryKey,
  createJudgmentKey,
  getDocumentIdentity,
} from "@/utils/canonicalize-document-url"

describe("canonical URL identity policy v1", () => {
  test("has an explicit version", () => expect(CANONICALIZATION_VERSION).toBe("1"))
  test("normalizes hostname, protocols, and default ports", () => {
    expect(canonicalizeDocumentUrl("http://EXAMPLE.com:80/a")).toBe("https://example.com/a")
    expect(canonicalizeDocumentUrl("https://EXAMPLE.com:443/a")).toBe("https://example.com/a")
  })
  test("preserves non-default ports", () => {
    expect(canonicalizeDocumentUrl("https://example.com:80/a")).toBe("https://example.com:80/a")
  })
  test("retains the root slash and removes non-root trailing slashes", () => {
    expect(canonicalizeDocumentUrl("https://example.com")).toBe("https://example.com/")
    expect(canonicalizeDocumentUrl("https://example.com/a///")).toBe("https://example.com/a")
  })
  test("removes fragments", () => expect(canonicalizeDocumentUrl("https://example.com/a#part")).toBe("https://example.com/a"))
  test.each([...TRACKING_PARAMETERS_V1])("removes tracking parameter %s case-insensitively", parameter => {
    expect(canonicalizeDocumentUrl(`https://example.com/a?ID=42&${parameter.toUpperCase()}=tracking`)).toBe("https://example.com/a?ID=42")
  })
  test("preserves meaningful parameters and sorts keys and repeated values", () => {
    expect(canonicalizeDocumentUrl("https://example.com/a?z=3&id=42&a=2&a=1"))
      .toBe("https://example.com/a?a=1&a=2&id=42&z=3")
  })
  test("equivalent URLs produce identical identities", () => {
    const left = getDocumentIdentity("http://Example.com:80/article/?utm_source=x&id=42#section")
    const right = getDocumentIdentity("https://example.com/article?id=42")
    expect(left).toEqual(right)
    expect(left.documentKey).toMatch(/^[a-f0-9]{64}$/)
    expect(createDocumentKey(left.canonicalUrl)).toBe(left.documentKey)
  })
  test.each(["", "not a url", "ftp://example.com/a"])('rejects invalid URL "%s"', value => {
    expect(() => canonicalizeDocumentUrl(value)).toThrow()
  })
  test("createDocumentKey rejects a raw noncanonical URL", () => {
    expect(() => createDocumentKey("http://EXAMPLE.com/a")).toThrow("canonical URL")
  })
  test("judgment and query keys are deterministic and tuple-sensitive", () => {
    const documentKey = getDocumentIdentity("https://example.com/a").documentKey
    expect(createJudgmentKey("v1", "q1", documentKey)).toBe(createJudgmentKey("v1", "q1", documentKey))
    expect(createJudgmentKey("v1", "q1", documentKey)).not.toBe(createJudgmentKey("v1", "q2", documentKey))
    expect(createEvaluationQueryKey("v1", "source-1")).toBe(createEvaluationQueryKey("v1", "source-1"))
    expect(() => createJudgmentKey("", "q1", documentKey)).toThrow()
  })
})
