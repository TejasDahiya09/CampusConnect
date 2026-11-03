import io
import re
import zipfile

from docx import Document
from pypdf import PdfReader


class ResumeParseError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _normalize_text(text: str, maximum: int) -> str:
    value = text.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    value = re.sub(r"[\u2022\u2023\u25e6\u2043\u2219]", "-", value)
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value).strip()
    if not value:
        raise ResumeParseError("EMPTY_DOCUMENT", "The resume does not contain extractable text.")
    if len(value) > maximum:
        raise ResumeParseError("TEXT_TOO_LARGE", "The extracted resume text exceeds the safe limit.")
    return value


def parse_pdf(content: bytes, maximum: int) -> str:
    if not content.startswith(b"%PDF-"):
        raise ResumeParseError("INVALID_DOCUMENT", "The uploaded file is not a valid PDF.")
    try:
        reader = PdfReader(io.BytesIO(content), strict=True)
        if reader.is_encrypted:
            raise ResumeParseError("ENCRYPTED_DOCUMENT", "Encrypted resumes are not supported.")
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except ResumeParseError:
        raise
    except Exception as error:
        raise ResumeParseError("INVALID_DOCUMENT", "The PDF is malformed or corrupted.") from error
    if not text.strip():
        raise ResumeParseError(
            "SCANNED_PDF",
            "This PDF appears to contain scanned images. Please upload a text-based PDF or DOCX resume.",
        )
    return _normalize_text(text, maximum)


def _validate_docx_archive(content: bytes) -> None:
    if not content.startswith(b"PK\x03\x04"):
        raise ResumeParseError("INVALID_DOCUMENT", "The uploaded file is not a valid DOCX document.")
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            entries = archive.infolist()
            if len(entries) > 256:
                raise ResumeParseError("UNSAFE_DOCUMENT", "The DOCX contains too many archive entries.")
            total = 0
            for entry in entries:
                path = entry.filename.replace("\\", "/")
                lowered = path.lower()
                if path.startswith("/") or ".." in path.split("/"):
                    raise ResumeParseError("UNSAFE_DOCUMENT", "The DOCX contains an unsafe archive path.")
                if any(part in lowered for part in ("vbaproject", "activex", "embeddings/", "oleobject", "externallinks/")):
                    raise ResumeParseError("UNSAFE_DOCUMENT", "Embedded or active DOCX content is not supported.")
                total += entry.file_size
                if entry.file_size > 0 and entry.compress_size == 0:
                    raise ResumeParseError("UNSAFE_DOCUMENT", "The DOCX archive is malformed.")
                if entry.compress_size > 0 and entry.file_size / entry.compress_size > 100:
                    raise ResumeParseError("UNSAFE_DOCUMENT", "The DOCX compression ratio is unsafe.")
            if total > 20_000_000:
                raise ResumeParseError("UNSAFE_DOCUMENT", "The expanded DOCX exceeds the safe limit.")
            if "[Content_Types].xml" not in archive.namelist() or "word/document.xml" not in archive.namelist():
                raise ResumeParseError("INVALID_DOCUMENT", "The DOCX structure is incomplete.")
    except ResumeParseError:
        raise
    except (OSError, zipfile.BadZipFile) as error:
        raise ResumeParseError("INVALID_DOCUMENT", "The DOCX is malformed or corrupted.") from error


def parse_docx(content: bytes, maximum: int) -> str:
    _validate_docx_archive(content)
    try:
        document = Document(io.BytesIO(content))
        blocks = [paragraph.text for paragraph in document.paragraphs]
        blocks.extend(cell.text for table in document.tables for row in table.rows for cell in row.cells)
        return _normalize_text("\n".join(blocks), maximum)
    except ResumeParseError:
        raise
    except Exception as error:
        raise ResumeParseError("INVALID_DOCUMENT", "The DOCX is malformed or corrupted.") from error


def parse_resume(content: bytes, media_type: str, maximum: int) -> str:
    if media_type == "application/pdf":
        return parse_pdf(content, maximum)
    if media_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        return parse_docx(content, maximum)
    raise ResumeParseError("UNSUPPORTED_FORMAT", "Only PDF and DOCX resumes are supported.")
