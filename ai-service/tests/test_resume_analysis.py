import io

from docx import Document
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app.resume.parser import ResumeParseError, parse_docx, parse_pdf
from app.resume.skills import extract_skills
from test_operational_routes import TEST_API_KEY, create_client


def docx_bytes(text: str) -> bytes:
    document = Document()
    document.add_paragraph(text)
    table = document.add_table(rows=1, cols=1)
    table.cell(0, 0).text = "PostgreSQL"
    output = io.BytesIO()
    document.save(output)
    return output.getvalue()


def text_pdf_bytes(text: str) -> bytes:
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, value in enumerate(objects, 1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode("ascii") + value + b"\nendobj\n")
    xref = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("ascii"))
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode("ascii"))
    return bytes(output)


def test_pdf_extracts_selectable_text() -> None:
    text = parse_pdf(text_pdf_bytes("Python React TypeScript"), 10_000)
    assert {"Python", "React", "TypeScript"}.issubset({skill.name for skill in extract_skills(text)})


def test_docx_extracts_paragraphs_tables_aliases_and_evidence() -> None:
    text = parse_docx(docx_bytes("Built REST APIs with React.js and NodeJS using Python."), 10_000)
    skills = {skill.name: skill for skill in extract_skills(text)}
    assert {"REST APIs", "React", "Node.js", "Python", "PostgreSQL"}.issubset(skills)
    assert skills["React"].method == "alias_normalization"
    assert "React.js" in skills["React"].evidence


def test_skill_extraction_deduplicates_and_rejects_negated_or_ambiguous_mentions() -> None:
    skills = extract_skills("React React.js. No experience with Docker. ML club member.")
    names = [skill.name for skill in skills]
    assert names.count("React") == 1
    assert "Docker" not in names
    assert "Machine Learning" not in names


def test_contextual_ml_alias_requires_relevant_evidence() -> None:
    skills = extract_skills("Trained an ML classification model using Python.")
    assert "Machine Learning" in {skill.name for skill in skills}


def test_parser_rejects_corrupt_empty_and_scanned_documents() -> None:
    try:
        parse_docx(b"PK\x03\x04broken", 10_000)
        raise AssertionError("corrupt DOCX accepted")
    except ResumeParseError as error:
        assert error.code == "INVALID_DOCUMENT"
    blank = io.BytesIO()
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    writer.write(blank)
    try:
        parse_pdf(blank.getvalue(), 10_000)
        raise AssertionError("scanned or blank PDF accepted")
    except ResumeParseError as error:
        assert error.code == "SCANNED_PDF"
    empty_document = Document()
    empty_output = io.BytesIO()
    empty_document.save(empty_output)
    try:
        parse_docx(empty_output.getvalue(), 10_000)
        raise AssertionError("empty DOCX accepted")
    except ResumeParseError as error:
        assert error.code == "EMPTY_DOCUMENT"
    try:
        parse_pdf(b"%PDF-1.4\ninvalid", 10_000)
        raise AssertionError("corrupt PDF accepted")
    except ResumeParseError as error:
        assert error.code == "INVALID_DOCUMENT"


def test_internal_route_requires_auth_and_analyzes_docx_without_returning_resume_text() -> None:
    configured = create_client()
    anonymous = TestClient(configured.app)
    content = docx_bytes("Developed a React application using TypeScript.\nPrivate phone: 0000000000")
    assert anonymous.post("/api/v1/resume/analyze", content=content, headers={"Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}).status_code == 401
    response = configured.post("/api/v1/resume/analyze", content=content, headers={"Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "X-CampusConnect-AI-Key": TEST_API_KEY})
    assert response.status_code == 200
    body = response.json()
    assert {skill["name"] for skill in body["skills"]} >= {"React", "TypeScript"}
    assert "Private phone" not in response.text


def test_route_rejects_unsupported_and_oversized_documents() -> None:
    client = create_client()
    unsupported = client.post("/api/v1/resume/analyze", content=b"plain text", headers={"Content-Type": "text/plain", "X-CampusConnect-AI-Key": TEST_API_KEY})
    assert unsupported.status_code == 422
    oversized = client.post("/api/v1/resume/analyze", content=b"x" * 5_242_881, headers={"Content-Type": "application/pdf", "X-CampusConnect-AI-Key": TEST_API_KEY})
    assert oversized.status_code == 413
