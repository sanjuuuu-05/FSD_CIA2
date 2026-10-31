"""Streamlit wrapper for OSM Route Explorer.

Embeds the existing single-file front end (index.html) in a Streamlit page.
The page has its own top navigation (Route planner, Directions, Explore region, About)
and covers the Bengaluru–Coimbatore region, with car, bike and walk modes. Keep index.html in the same folder as this file.
The sample route is inlined because an embedded page cannot fetch sibling files.
"""
import json
import re
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

HERE = Path(__file__).parent

st.set_page_config(page_title="OSM Route Explorer", layout="wide")

# Use the full width, but keep the top clear of Streamlit's fixed header.
st.markdown(
    "<style>"
    # Leave room for Streamlit's fixed header so it does not cover the page's nav bar.
    ".block-container{padding:3.75rem 1rem 0 1rem;max-width:100%}"
    "header[data-testid='stHeader']{background:transparent}"
    # Fit the embedded app to the browser window so the page never scrolls the nav bar out of view.
    "iframe{border:0;height:calc(100vh - 4.5rem)!important;min-height:600px}"
    "</style>",
    unsafe_allow_html=True,
)


def inline_local_assets(html: str) -> str:
    """Inline local <link rel="stylesheet" href="x.css"> and <script src="x.js"> files.

    Streamlit embeds the page as a string (srcdoc iframe), so relative files such as
    styles.css and app.js cannot be fetched by the browser. Remote URLs are left alone.
    """

    def css(m):
        href = m.group(1)
        f = HERE / href
        if re.match(r"^(https?:)?//", href) or not f.is_file():
            return m.group(0)
        return "<style>\n" + f.read_text(encoding="utf-8").replace("</style", "<\\/style") + "\n</style>"

    def js(m):
        src = m.group(1)
        f = HERE / src
        if re.match(r"^(https?:)?//", src) or not f.is_file():
            return m.group(0)
        return "<script>\n" + f.read_text(encoding="utf-8").replace("</script", "<\\/script") + "\n</script>"

    html = re.sub(r'<link\b[^>]*rel=["\']stylesheet["\'][^>]*href=["\']([^"\']+)["\'][^>]*>', css, html)
    html = re.sub(r'<link\b[^>]*href=["\']([^"\']+)["\'][^>]*rel=["\']stylesheet["\'][^>]*>', css, html)
    html = re.sub(r'<script\b[^>]*src=["\']([^"\']+)["\'][^>]*>\s*</script>', js, html)
    return html


def load_page() -> str:
    html = (HERE / "index.html").read_text(encoding="utf-8")
    html = inline_local_assets(html)
    sample_path = HERE / "sample-route.geojson"
    if sample_path.exists():
        sample = json.dumps(json.loads(sample_path.read_text(encoding="utf-8")))
        sample = sample.replace("</", "<\\/")  # keep the literal safe inside <script>
        html = html.replace(
            "await fetchJson('sample-route.geojson', 'The sample route file')",
            f"({sample})",
        )
    return html


# The page is a full-height app; scrolling=True lets the side panel scroll on small screens.
components.html(load_page(), height=880, scrolling=True)

st.caption(
    "Prototype using public demo services (Nominatim, OSRM, map tiles). "
    "Map data © OpenStreetMap contributors."
)
