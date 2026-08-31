from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Store staff. Two roles matter for the POS rules (see docs/02-product-brief.md):

      - associate : runs the till, sales and straightforward exchanges
      - manager   : can approve discounts over the cap, no-receipt returns and
                    out-of-tolerance cash variances
    """

    class Role(models.TextChoices):
        ASSOCIATE = "associate", "Sales Associate"
        MANAGER = "manager", "Store Manager"

    role = models.CharField(max_length=16, choices=Role.choices, default=Role.ASSOCIATE)

    @property
    def is_manager(self) -> bool:
        return self.role == self.Role.MANAGER

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.role})"
