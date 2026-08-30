#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Lazy access to PyThaiNLP, so --help and the pure-format code run without it.

Every PyThaiNLP call in the pipeline goes through this module. Nothing here
touches the network: PyThaiNLP ships its dictionaries in the wheel, and the
pipeline never downloads a corpus at runtime (DESIGN.md §1.1).
"""
import functools
import re

# ── Dependency guard ─────────────────────────────────────────────────────────

INSTALL_HINT = (
    "    pip install pythainlp python-docx\n"
    "Tested with pythainlp 5.3.7 and python-docx 1.1.2 (see README.md)."
)


class MissingDependency(RuntimeError):
    """Raised with an actionable message instead of a bare ImportError."""


def _pythainlp():
    try:
        import pythainlp  # noqa: F401
    except ImportError as exc:                      # pragma: no cover - env dependent
        raise MissingDependency(
            "This stage needs PyThaiNLP, which is not installed.\n" + INSTALL_HINT
        ) from exc
    return pythainlp


def pythainlp_version():
    """Version string for builder metadata; never raises."""
    try:
        return _pythainlp().__version__
    except MissingDependency:
        return "not installed"


def require_pythainlp():
    """Fail early, with the install hint, before a long stage starts."""
    _pythainlp()


# ── Thai text utilities ──────────────────────────────────────────────────────

def normalize(text):
    """pythainlp.util.normalize() applied line by line.

    normalize() collapses blank lines and runs of spaces. The clean stage still
    needs its blank lines (they block the line-join rule, DESIGN.md §3.2 step 4),
    so we normalize each line on its own and keep the line structure intact.
    """
    _pythainlp()
    from pythainlp.util import normalize as _normalize
    return "\n".join(_normalize(line) for line in text.split("\n"))


def count_thai(text):
    """Percentage of Thai characters, 0-100 (pythainlp.util.countthai)."""
    if not text:
        return 0.0
    _pythainlp()
    from pythainlp.util import countthai
    return float(countthai(text))


@functools.lru_cache(maxsize=1)
def thai_words():
    """The base PyThaiNLP dictionary, as a frozenset."""
    _pythainlp()
    from pythainlp.corpus.common import thai_words as _thai_words
    return frozenset(_thai_words())


@functools.lru_cache(maxsize=1)
def thai_stopwords():
    _pythainlp()
    from pythainlp.corpus import thai_stopwords as _stop
    return sorted(_stop())


@functools.lru_cache(maxsize=4)
def tokenizer(extra_words=frozenset()):
    """newmm over thai_words() | lexicon/legal-terms.txt (DESIGN.md §3.4).

    keep_whitespace=True is load-bearing: the token stream must tile the clause
    text exactly, because `b` stores start offsets only (DESIGN.md §4.3).
    """
    _pythainlp()
    from pythainlp.tokenize import Tokenizer
    from pythainlp.util import dict_trie
    words = set(thai_words()) | set(extra_words)
    return Tokenizer(custom_dict=dict_trie(words), engine="newmm", keep_whitespace=True)


# ── English tokenizer (PyThaiNLP is not used for English, DESIGN.md §3.4) ─────

_EN_TOKEN = re.compile(r"[A-Za-z0-9]+(?:[.'’-][A-Za-z0-9]+)*|\s+|[^\sA-Za-z0-9]")


def tokenize_en(text):
    """Word / whitespace / punctuation tokens that tile the text exactly."""
    return [m.group(0) for m in _EN_TOKEN.finditer(text)]


# ── Dictionary lookup for the OOV rate (DESIGN.md §3.5) ──────────────────────

THAI_CHAR = re.compile(r"[฀-๿]")


def is_thai_token(token):
    return bool(THAI_CHAR.search(token))
