"""Streamlit wrapper for OSM Route Explorer.

Embeds the existing single-file front end (index.html) in a Streamlit page.
The page now has its own top navigation (Route planner, Directions, Explore India, About)
and covers all of India. Keep index.html in the same folder as this file.
The sample route is inlined because an embedded page cannot fetch sibling files.
"""
import json
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


def load_page() -> str:
    html = (HERE / "index.html").read_text(encoding="utf-8")
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
    "The India outline is simplified and approximate. "
    "Map data © OpenStreetMap contributors."
)
