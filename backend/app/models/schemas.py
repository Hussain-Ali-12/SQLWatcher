from pydantic import BaseModel, Field
from typing import Any

class QueryRequest(BaseModel):
    sql: str = Field(..., min_length=1)
    db_user: str = "web_app"
    client_ip: str = "127.0.0.1"

class DetectionResult(BaseModel):
    action: str
    severity: str
    risk_score: int
    detection_method: str
    explanation: str
    query_type: str | None = None
    normalized_sql: str | None = None

class QueryResponse(BaseModel):
    action: str
    severity: str
    risk_score: int
    explanation: str
    data: list[dict[str, Any]] | None = None
    query_id: int | None = None
    normalized_sql: str | None = None
    features: dict[str, Any] | None = None

class AlertDecisionRequest(BaseModel):
    decision: str = Field(..., description="confirm_block, allow_instance, escalate, false_positive")
    analyst_name: str = "analyst"
    notes: str = ""

class RuleCreateRequest(BaseModel):
    rule_name: str = Field(..., min_length=3, max_length=128)
    description: str = Field(..., min_length=3, max_length=1000)
    severity: str = "MEDIUM"
    action: str = "FLAG"
    enabled: bool = True
    rule_type: str = "KEYWORD"
    match_pattern: str = Field(..., min_length=1, max_length=1000)
    match_target: str = "RAW_SQL"
    risk_score: int = Field(default=50, ge=0, le=100)

class RuleUpdateRequest(BaseModel):
    rule_name: str | None = Field(default=None, min_length=3, max_length=128)
    description: str | None = Field(default=None, min_length=3, max_length=1000)
    enabled: bool | None = None
    severity: str | None = None
    action: str | None = None
    rule_type: str | None = None
    match_pattern: str | None = Field(default=None, min_length=1, max_length=1000)
    match_target: str | None = None
    risk_score: int | None = Field(default=None, ge=0, le=100)

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3)
    password: str = Field(..., min_length=1)

class AuthUser(BaseModel):
    user_id: int
    username: str
    email: str
    full_name: str
    role: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: str
    user: AuthUser

class NotificationReadRequest(BaseModel):
    notification_ids: list[int] = Field(default_factory=list)
