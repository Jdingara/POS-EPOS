"""
Idempotent demo seed for the Apparel Retail POS.

Run automatically on container start (see entrypoint.sh) or by hand:

    python manage.py seed

Creates staff, an apparel catalog with size x colour variants, and a few
realistic promotions. Safe to run repeatedly.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from catalog.models import Brand, Category, Promotion, Style, Variant

User = get_user_model()

# --------------------------------------------------------------------------- #
#  catalog definition   (prices in rupees here; converted to paise on save)
# --------------------------------------------------------------------------- #
BRANDS = ["Urban Oxford", "Terra Denim", "Bloom & Co", "TrailPeak"]
CATEGORIES = ["Shirts", "T-Shirts", "Jeans", "Dresses", "Jackets", "Footwear"]

STYLES = [
    # style_code, name, brand, category, season, mrp_rupees, colours, sizes, hsn
    ("SHRT-OXF-001", "Oxford Cotton Shirt", "Urban Oxford", "Shirts", "AW25", 1799,
     ["Sky Blue", "White", "Olive"], ["38", "40", "42", "44"], "6205"),
    ("TEE-CRW-014", "Crew Neck T-Shirt", "Bloom & Co", "T-Shirts", "Core", 699,
     ["Black", "White", "Navy", "Maroon"], ["S", "M", "L", "XL"], "6109"),
    ("JNS-SLM-207", "Slim Fit Jeans", "Terra Denim", "Jeans", "Core", 2499,
     ["Indigo", "Stone Wash"], ["30", "32", "34", "36"], "6203"),
    ("DRS-FLR-045", "Floral Midi Dress", "Bloom & Co", "Dresses", "SS25", 1499,
     ["Rust", "Teal"], ["XS", "S", "M", "L"], "6204"),
    ("JKT-PUF-088", "Puffer Jacket", "TrailPeak", "Jackets", "AW25", 3999,
     ["Black", "Mustard"], ["M", "L", "XL"], "6201"),
    ("SNK-RUN-330", "Road Runner Sneakers", "TrailPeak", "Footwear", "Core", 2899,
     ["Grey / Lime", "All Black"], ["UK6", "UK7", "UK8", "UK9", "UK10"], "6404"),
]

# DRS-FLR-045 MRP above is already the *marked-down* tag price (was 1,999).
# That is a PRICE CHANGE - distinct from the EOSS promotion added below.


class Command(BaseCommand):
    help = "Seed demo staff, apparel catalog and promotions (idempotent)."

    @transaction.atomic
    def handle(self, *args, **opts):
        self._staff()
        self._catalog()
        self._promotions()
        self.stdout.write(self.style.SUCCESS("\nSeed complete."))
        self.stdout.write(
            "\nLogins:\n"
            "  manager  / manager123   (Store Manager - can approve overrides)\n"
            "  cashier  / cashier123   (Sales Associate)\n"
            "  admin    / admin123      (Django /admin)\n"
        )

    # ------------------------------------------------------------------ #
    def _staff(self):
        defs = [
            ("admin", "admin123", "Site", "Admin", "manager", True, True),
            ("manager", "manager123", "Asha", "Nair", "manager", True, False),
            ("cashier", "cashier123", "Ravi", "Kumar", "associate", False, False),
        ]
        for username, pw, first, last, role, is_staff, is_super in defs:
            user, created = User.objects.get_or_create(
                username=username,
                defaults=dict(first_name=first, last_name=last, role=role,
                              is_staff=is_staff or is_super, is_superuser=is_super),
            )
            if created:
                user.set_password(pw)
                user.save()
                self.stdout.write(f"  + user {username}")

    # ------------------------------------------------------------------ #
    def _catalog(self):
        brands = {b: Brand.objects.get_or_create(name=b)[0] for b in BRANDS}
        cats = {c: Category.objects.get_or_create(name=c)[0] for c in CATEGORIES}

        bc = 8800000000000  # base for pseudo EAN-13 barcodes
        seq = 0
        for code, name, brand, cat, season, mrp, colours, sizes, hsn in STYLES:
            style, _ = Style.objects.update_or_create(
                style_code=code,
                defaults=dict(
                    name=name, brand=brands[brand], category=cats[cat],
                    season=season, hsn=hsn, mrp_paise=mrp * 100, is_active=True,
                ),
            )
            for ci, colour in enumerate(colours):
                for si, size in enumerate(sizes):
                    seq += 1
                    barcode = str(bc + seq)
                    # a rough size curve: middle sizes carry more stock
                    mid = len(sizes) / 2
                    stock = 12 - int(abs(si - mid) * 3) + (ci % 2)
                    stock = max(stock, 2)
                    Variant.objects.update_or_create(
                        style=style, size=size, color=colour,
                        defaults=dict(barcode=barcode, stock=stock, is_sellable=True),
                    )
            self.stdout.write(f"  + style {code}  ({len(colours) * len(sizes)} variants)")

        # a couple of deliberate stock situations for the demo
        Variant.objects.filter(style__style_code="SNK-RUN-330", size="UK6").update(stock=0)
        Variant.objects.filter(style__style_code="JKT-PUF-088", size="XL", color="Mustard").update(stock=1)

    # ------------------------------------------------------------------ #
    def _promotions(self):
        today = timezone.localdate()
        cats = {c.name: c for c in Category.objects.all()}
        brands = {b.name: b for b in Brand.objects.all()}

        p1, _ = Promotion.objects.update_or_create(
            name="Winter Warmers - 30% off Jackets",
            defaults=dict(
                scope=Promotion.Scope.CATEGORY, category=cats["Jackets"], brand=None,
                percent=30, starts_on=today - timedelta(days=7),
                ends_on=today + timedelta(days=30), min_qty=1, active=True,
            ),
        )
        p2, _ = Promotion.objects.update_or_create(
            name="Brand Day - 15% off Urban Oxford",
            defaults=dict(
                scope=Promotion.Scope.BRAND, brand=brands["Urban Oxford"], category=None,
                percent=15, starts_on=today - timedelta(days=2),
                ends_on=today + timedelta(days=10), min_qty=1, active=True,
            ),
        )
        p3, _ = Promotion.objects.update_or_create(
            name="End of Season - 40% off SS25 Dresses",
            defaults=dict(
                scope=Promotion.Scope.STYLES, category=None, brand=None,
                percent=40, starts_on=today - timedelta(days=5),
                ends_on=today + timedelta(days=20), min_qty=1, active=True,
            ),
        )
        p3.styles.set(Style.objects.filter(style_code="DRS-FLR-045"))

        # active flag on, but the window has passed - proves the date check
        Promotion.objects.update_or_create(
            name="Republic Day Sale - 20% off Footwear (expired)",
            defaults=dict(
                scope=Promotion.Scope.CATEGORY, category=cats["Footwear"], brand=None,
                percent=20, starts_on=today - timedelta(days=40),
                ends_on=today - timedelta(days=1), min_qty=1, active=True,
            ),
        )
        self.stdout.write("  + 4 promotions (3 live, 1 out-of-window)")
