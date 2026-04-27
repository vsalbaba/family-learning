import pytest

from app.services.svg_validator import validate_svg


VALID_SVG = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" fill="red"/></svg>'


class TestValidSvg:
    def test_simple_svg_passes(self):
        assert validate_svg(VALID_SVG) == []

    def test_svg_with_internal_href_passes(self):
        svg = '<svg viewBox="0 0 100 100"><defs><linearGradient id="g1"><stop offset="0" stop-color="red"/></linearGradient></defs><rect fill="url(#g1)" width="100" height="100"/></svg>'
        assert validate_svg(svg) == []

    def test_svg_with_whitespace_passes(self):
        assert validate_svg("  " + VALID_SVG + "  ") == []


class TestStructuralErrors:
    def test_missing_svg_open_tag(self):
        errors = validate_svg('<div>not svg</div>')
        assert any("začínat" in e for e in errors)

    def test_missing_svg_close_tag(self):
        errors = validate_svg('<svg viewBox="0 0 100 100"><circle/>')
        assert any("</svg>" in e for e in errors)

    def test_exceeds_size_limit(self):
        big = '<svg viewBox="0 0 1 1">' + "x" * 110_000 + '</svg>'
        errors = validate_svg(big)
        assert any("limit" in e or "překračuje" in e for e in errors)


class TestBlockedPatterns:
    def test_script_tag(self):
        svg = '<svg><script>alert(1)</script></svg>'
        errors = validate_svg(svg)
        assert any("<script" in e for e in errors)

    def test_foreignobject(self):
        svg = '<svg><foreignObject><div>html</div></foreignObject></svg>'
        errors = validate_svg(svg)
        assert any("foreignobject" in e.lower() for e in errors)

    def test_iframe(self):
        svg = '<svg><iframe src="evil.html"/></svg>'
        errors = validate_svg(svg)
        assert any("iframe" in e.lower() for e in errors)

    def test_object_tag(self):
        svg = '<svg><object data="evil.swf"/></svg>'
        errors = validate_svg(svg)
        assert any("object" in e.lower() for e in errors)

    def test_embed_tag(self):
        svg = '<svg><embed src="evil"/></svg>'
        errors = validate_svg(svg)
        assert any("embed" in e.lower() for e in errors)

    def test_image_tag(self):
        svg = '<svg><image href="data:image/png;base64,abc"/></svg>'
        errors = validate_svg(svg)
        assert any("image" in e.lower() for e in errors)

    def test_javascript_uri(self):
        svg = '<svg><a href="javascript:alert(1)"><text>click</text></a></svg>'
        errors = validate_svg(svg)
        assert any("javascript" in e for e in errors)

    def test_data_text_html(self):
        svg = '<svg><a href="data:text/html,<script>alert(1)</script>"><text>x</text></a></svg>'
        errors = validate_svg(svg)
        assert any("data:text/html" in e for e in errors)

    def test_xml_declaration(self):
        svg = '<?xml version="1.0"?><svg><circle/></svg>'
        errors = validate_svg(svg)
        assert any("<?xml" in e for e in errors)

    def test_doctype(self):
        svg = '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "..."><svg><circle/></svg>'
        errors = validate_svg(svg)
        assert any("doctype" in e.lower() for e in errors)

    def test_external_href_http(self):
        svg = '<svg><use href="http://evil.com/sprite.svg#icon"/></svg>'
        errors = validate_svg(svg)
        assert any("href" in e for e in errors)

    def test_external_xlink_href(self):
        svg = '<svg><use xlink:href="http://evil.com/sprite.svg#icon"/></svg>'
        errors = validate_svg(svg)
        assert any("xlink:href" in e for e in errors)

    def test_protocol_relative_href(self):
        svg = '<svg><use href="//evil.com/sprite.svg#icon"/></svg>'
        errors = validate_svg(svg)
        assert any("href" in e for e in errors)


class TestEventHandlers:
    def test_onload(self):
        svg = '<svg onload="alert(1)"><circle/></svg>'
        errors = validate_svg(svg)
        assert any("event handler" in e for e in errors)

    def test_onclick(self):
        svg = '<svg><circle onclick="alert(1)"/></svg>'
        errors = validate_svg(svg)
        assert any("event handler" in e for e in errors)

    def test_onerror(self):
        svg = '<svg><image onerror="alert(1)"/></svg>'
        errors = validate_svg(svg)
        assert any("event handler" in e for e in errors)

    def test_onmouseover(self):
        svg = '<svg><rect onmouseover ="alert(1)"/></svg>'
        errors = validate_svg(svg)
        assert any("event handler" in e for e in errors)
