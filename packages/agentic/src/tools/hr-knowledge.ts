import {
  retrieveHrForms,
  retrieveHrProcess,
  type HrDocumentRetrieverOptions,
  type RetrievedDocument,
} from "../retrievers/hr-docs.js";

export interface HrKnowledgeAnswer {
  answer: string;
  documents: RetrievedDocument[];
  retrievedContext: string;
  warnings: string[];
}

type HrRetrievalMode = "forms" | "process" | "both";

export async function answerHrKnowledgeQuestion(
  query: string,
): Promise<HrKnowledgeAnswer>;
export async function answerHrKnowledgeQuestion(
  query: string,
  options: HrDocumentRetrieverOptions,
): Promise<HrKnowledgeAnswer>;
export async function answerHrKnowledgeQuestion(
  query: string,
  options: HrDocumentRetrieverOptions = {},
): Promise<HrKnowledgeAnswer> {
  try {
    const documents = await retrieveHrKnowledgeDocuments(query, options);

    if (documents.length === 0) {
      return {
        answer:
          "Em chua tim thay noi dung HR phu hop trong nguon kien thuc hien tai.",
        documents,
        retrievedContext: "",
        warnings: ["HR_RETRIEVER_EMPTY"],
      };
    }

    const retrievedContext = formatRetrievedContext(documents);
    return {
      answer: retrievedContext,
      documents,
      retrievedContext,
      warnings: [],
    };
  } catch (error) {
    return {
      answer: "Nguon kien thuc HR hien khong san sang.",
      documents: [],
      retrievedContext: "",
      warnings: [
        `HR_RETRIEVER_UNAVAILABLE:${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    };
  }
}

async function retrieveHrKnowledgeDocuments(
  query: string,
  options: HrDocumentRetrieverOptions,
): Promise<RetrievedDocument[]> {
  const mode = selectHrRetrievalMode(query);

  if (mode === "forms") {
    return retrieveHrForms(query, options);
  }

  if (mode === "process") {
    return retrieveCompleteHrProcess(query, options, true);
  }

  const processDocuments = await retrieveCompleteHrProcess(
    query,
    options,
    false,
  );
  const formDocuments = await retrieveHrForms(query, options);
  return dedupeDocuments([...processDocuments, ...formDocuments]);
}

async function retrieveCompleteHrProcess(
  query: string,
  options: HrDocumentRetrieverOptions,
  allowRetry: boolean,
): Promise<RetrievedDocument[]> {
  const documents = await retrieveHrProcess(query, options);

  if (!allowRetry || !shouldRetryProcessRetrieval(documents)) {
    return documents;
  }

  const expandedDocuments = await retrieveHrProcess(query, {
    ...options,
    pageSize: Math.max(options.pageSize ?? 0, 16),
  });

  return expandedDocuments.length > 0 ? expandedDocuments : documents;
}

function selectHrRetrievalMode(query: string): HrRetrievalMode {
  const normalized = normalizeSearchText(query);
  const hasProcessSignal = includesAny(normalized, [
    "approval",
    "approver",
    "cac buoc",
    "phe duyet",
    "process",
    "procedure",
    "quy trinh",
    "sop",
    "step",
    "steps",
    "thu tuc",
  ]);
  const hasFormSignal = includesAny(normalized, [
    "bieu mau",
    "code",
    "don",
    "download",
    "form",
    "link",
    "mau",
    "phieu",
    "template",
    "url",
  ]);

  if (hasProcessSignal && hasFormSignal) return "both";
  if (hasFormSignal) return "forms";
  if (hasProcessSignal) return "process";
  return "both";
}

function shouldRetryProcessRetrieval(documents: RetrievedDocument[]): boolean {
  if (documents.length === 0) return false;

  const combinedContent = documents
    .map((document) => document.content)
    .join("\n")
    .toLowerCase();
  const hasStepOne = /\b(buoc|bước|step)\s*1\b/i.test(combinedContent);
  const hasLaterStep = /\b(buoc|bước|step)\s*[2-9]\b/i.test(combinedContent);

  return documents.length <= 1 && hasStepOne && !hasLaterStep;
}

function dedupeDocuments(documents: RetrievedDocument[]): RetrievedDocument[] {
  const seen = new Set<string>();
  const result: RetrievedDocument[] = [];

  for (const document of documents) {
    const key =
      document.documentId ??
      document.chunkId ??
      `${document.title}\n${document.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(document);
  }

  return result;
}

function formatRetrievedContext(documents: RetrievedDocument[]): string {
  return documents.map(formatDocumentContext).join("\n");
}

function formatDocumentContext(document: RetrievedDocument): string {
  const metadata = [
    document.documentId ? `document_id=${document.documentId}` : "",
    document.chunkId ? `chunk_id=${document.chunkId}` : "",
    firstSourceUrl(document) ? `source_url=${firstSourceUrl(document)}` : "",
  ]
    .filter(Boolean)
    .join("; ");
  const suffix = metadata ? ` (${metadata})` : "";

  return `${document.title}${suffix}: ${document.content}`;
}

function firstSourceUrl(document: RetrievedDocument): string | undefined {
  return (
    document.downloadUrl ??
    document.originFileUrl ??
    document.url ??
    document.sourceUrl ??
    document.fileUrl
  );
}

function includesAny(normalizedQuery: string, terms: string[]): boolean {
  return terms.some((term) => normalizedQuery.includes(term));
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/đ/g, "d")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}
