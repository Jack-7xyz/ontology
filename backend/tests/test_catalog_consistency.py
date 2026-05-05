from backend.app import bi, mechanics
from backend.app.bi import improvements


def test_mechanic_pages_have_real_insights_and_improvements():
    all_items = {item["id"] for item in improvements.get_all_enriched()}

    for mechanic_id in mechanics.list_mechanic_ids():
        meta = mechanics.get_meta(mechanic_id)

        assert meta["key_insights"], mechanic_id
        assert meta["ontology_improvements"], mechanic_id
        assert meta["contributing_bi_ids"], mechanic_id

        for item in meta["ontology_improvements"]:
            assert item["mechanic"] == mechanic_id
            assert item["id"] in all_items


def test_bi_improvement_links_resolve_to_catalog_items():
    all_items = {item["id"] for item in improvements.get_all_enriched()}

    for bi_id in bi.list_bi_ids():
        meta = bi.get_meta(bi_id)
        assert "ontology_improvements" in meta

        for item in meta["ontology_improvements"]:
            assert bi_id in item["bi_ids"]
            assert item["id"] in all_items
