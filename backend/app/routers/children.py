from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.routers.auth import require_parent
from app.schemas.user import ChildCreate, ChildUpdate, UserResponse
from app.services.auth_service import hash_pin

router = APIRouter()


@router.get("", response_model=list[UserResponse])
def list_children(
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    children = db.query(User).filter(
        User.role == "child", User.parent_id == user.id
    ).all()
    return children


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_child(
    req: ChildCreate,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    child = User(
        name=req.name,
        role="child",
        pin_hash=hash_pin(req.pin),
        parent_id=user.id,
        avatar=req.avatar,
    )
    db.add(child)
    db.commit()
    db.refresh(child)
    return child


@router.put("/{child_id}", response_model=UserResponse)
def update_child(
    child_id: int,
    req: ChildUpdate,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    child = db.query(User).filter(
        User.id == child_id, User.role == "child", User.parent_id == user.id
    ).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    if req.name is not None:
        child.name = req.name
    if req.pin is not None:
        child.pin_hash = hash_pin(req.pin)
    if req.avatar is not None:
        child.avatar = req.avatar
    db.commit()
    db.refresh(child)
    return child


@router.delete("/{child_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_child(
    child_id: int,
    user: User = Depends(require_parent),
    db: Session = Depends(get_db),
):
    child = db.query(User).filter(
        User.id == child_id, User.role == "child", User.parent_id == user.id
    ).first()
    if not child:
        raise HTTPException(status_code=404, detail="Child not found")
    db.delete(child)
    db.commit()
