"""
Django settings for the Apparel Retail POS backend.

Kept deliberately simple and readable - this is a learning project. Anything that
would differ in production is called out with a comment.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


def env(key, default=None):
    return os.environ.get(key, default)


def env_bool(key, default=False):
    return str(os.environ.get(key, default)).lower() in ("1", "true", "yes", "on")


# ---------------------------------------------------------------------------
# Core
# ---------------------------------------------------------------------------
SECRET_KEY = env("DJANGO_SECRET_KEY", "dev-only-not-secret-change-me")
DEBUG = env_bool("DJANGO_DEBUG", True)
ALLOWED_HOSTS = env("DJANGO_ALLOWED_HOSTS", "*").split(",")
CSRF_TRUSTED_ORIGINS = [
    o for o in env(
        "DJANGO_CSRF_TRUSTED_ORIGINS",
        "http://localhost:8091,http://localhost:8001,http://127.0.0.1:8091,http://127.0.0.1:8001",
    ).split(",") if o
]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # third-party
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    # local
    "accounts",
    "catalog",
    "sales",
    "till",
    "core",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB", "apparelpos"),
        "USER": env("POSTGRES_USER", "apparelpos"),
        "PASSWORD": env("POSTGRES_PASSWORD", "apparelpos"),
        "HOST": env("POSTGRES_HOST", "localhost"),
        "PORT": env("POSTGRES_PORT", "5432"),
    }
}

AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = []  # relaxed for the demo seed users

# ---------------------------------------------------------------------------
# i18n / tz  (single-store Indian retailer)
# ---------------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static
# ---------------------------------------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    # non-manifest variant: forgiving during collectstatic, still gzip-compressed
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedStaticFilesStorage"},
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------------------
# DRF
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.TokenAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ],
}

CORS_ALLOW_ALL_ORIGINS = True  # demo only; the frontend actually calls same-origin /api via nginx

# ---------------------------------------------------------------------------
# Business rules (single place to tune - mirrors docs/02-product-brief.md)
# ---------------------------------------------------------------------------
POS = {
    "CURRENCY": "INR",
    "RETURN_WINDOW_DAYS": 30,
    "CASH_VARIANCE_TOLERANCE_PAISE": 10000,       # +/- Rs 100
    "CASHIER_DISCOUNT_LIMIT_PAISE": 200000,       # Rs 2,000 refund/discount without a manager
    "GST_RATE_LOW": 5,                            # apparel <= threshold per piece
    "GST_RATE_HIGH": 12,                          # apparel above threshold per piece
    "GST_PIECE_THRESHOLD_PAISE": 100000,          # Rs 1,000 per piece
    "STORE_NAME": "THREADLINE  (Fashion & Apparel)",
    "STORE_GSTIN": "33ABCDE1234F1Z5",
}
