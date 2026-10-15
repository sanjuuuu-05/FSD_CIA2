"""Streamlit wrapper for OSM Route Explorer.

Embeds the existing single-file front end (index.html) in a Streamlit page.
The sample route is inlined because an embedded page cannot fetch sibling files.
"""
import json
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

HERE = Path(__file__).parent

st.set_page_config(page_title="OSM Route Explorer", layout="wide")

# Remove Streamlit's default padding so the map can use the full width.
st.markdown(
    "<style>.block-container{padding:0.5rem 1rem 0 1rem;max-width:100%}"
    "header[data-testid='stHeader']{height:0}</style>",
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
components.html(load_page(), height=820, scrolling=True)

st.caption(
    "Prototype using public demo services (Nominatim, OSRM, map tiles). "
    "Map data © OpenStreetMap contributors."
)
