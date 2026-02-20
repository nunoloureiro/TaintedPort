import uuid

import requests


def test_list_reviews(base_url):
    r = requests.get(f"{base_url}/wines/1/reviews")
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert len(data["reviews"]) > 0


def test_create_review(base_url, fresh_user):
    r = requests.post(f"{base_url}/wines/9/reviews", headers=fresh_user["header"],
                      json={"rating": 4, "comment": "Nice Bairrada red!"})
    assert r.status_code in (200, 201)
    assert r.json()["success"] is True


def test_duplicate_review_rejected(base_url, fresh_user):
    h = fresh_user["header"]
    requests.post(f"{base_url}/wines/7/reviews", headers=h,
                  json={"rating": 5, "comment": "Great!"})
    r = requests.post(f"{base_url}/wines/7/reviews", headers=h,
                      json={"rating": 3, "comment": "Changed my mind"})
    assert r.json()["success"] is False


def test_review_rating_validation(base_url, fresh_user):
    r = requests.post(f"{base_url}/wines/8/reviews", headers=fresh_user["header"],
                      json={"rating": 6, "comment": "Too high"})
    assert r.json()["success"] is False


def test_review_unauthenticated(base_url):
    r = requests.post(f"{base_url}/wines/1/reviews",
                      json={"rating": 3, "comment": "No token"})
    assert r.status_code == 401


def test_average_ratings(base_url):
    r = requests.get(f"{base_url}/wines/ratings")
    assert r.status_code == 200
    data = r.json()
    assert data["success"] is True
    assert isinstance(data["ratings"], dict)
