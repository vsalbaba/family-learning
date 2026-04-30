"""Single-item read endpoint."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.package import Item
from app.models.user import User
from app.routers.auth import require_parent
from app.schemas.package import ItemResponse

router = APIRouter()


@router.get("/{item_id}", response_model=ItemResponse)
def get_item(
    item_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Otázka nenalezena")
    return item
