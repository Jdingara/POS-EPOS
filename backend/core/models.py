from django.db import models, transaction


class Sequence(models.Model):
    """
    Tiny gap-free counter used for document numbers (INV-..., RET-...).
    Row-locked so two concurrent tills can't grab the same number.
    """

    key = models.CharField(max_length=40, primary_key=True)
    value = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"{self.key} = {self.value}"

    @classmethod
    def next_for(cls, key: str) -> int:
        with transaction.atomic():
            row, _ = cls.objects.select_for_update().get_or_create(key=key)
            row.value += 1
            row.save(update_fields=["value"])
            return row.value
