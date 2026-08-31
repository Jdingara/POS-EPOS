#!/bin/sh
set -e

# Wait for Postgres
echo "Waiting for database at $POSTGRES_HOST:$POSTGRES_PORT ..."
until python -c "import socket,os,sys; s=socket.socket(); s.settimeout(2); s.connect((os.environ['POSTGRES_HOST'], int(os.environ['POSTGRES_PORT']))); s.close()" 2>/dev/null; do
  sleep 1
done
echo "Database is up."

# For this learning project we generate migrations at start-up so the schema
# always matches the models in the repo. In a production project these files
# would be committed and reviewed like any other code.
python manage.py makemigrations --noinput
python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py seed

exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 3 --timeout 60
