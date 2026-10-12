"""Consistent JSON error responses: {"error": {"code", "message", "details"}}."""
from __future__ import annotations

from flask import jsonify, request
from werkzeug.exceptions import HTTPException


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}


def error_response(status: int, code: str, message: str, details: dict | None = None):
    body = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    return jsonify(body), status


def register_error_handlers(app):
    @app.errorhandler(ApiError)
    def _api_error(err: ApiError):
        return error_response(err.status, err.code, err.message, err.details)

    @app.errorhandler(HTTPException)
    def _http_error(err: HTTPException):
        if request.path.startswith("/api/") or request.path.startswith("/socket.io"):
            code = (err.name or "HTTP_ERROR").upper().replace(" ", "_")
            return error_response(err.code or 500, code, err.description or err.name)
        return err

    @app.errorhandler(Exception)
    def _unhandled(err: Exception):
        app.logger.exception("Unhandled error on %s %s", request.method, request.path)
        from ..extensions import db

        try:
            db.session.rollback()
        except Exception:  # pragma: no cover
            pass
        return error_response(500, "INTERNAL_ERROR", "An unexpected server error occurred.")
