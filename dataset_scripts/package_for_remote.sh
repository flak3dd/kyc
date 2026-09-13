#!/bin/bash
# package_for_remote.sh
# Packages the python scripts into a zip archive for Spark distributed execution

echo "Packaging dataset_scripts into spark_dependencies.zip..."

# We zip only the python files since those are what the Spark executors need
zip -r spark_dependencies.zip *.py

echo "Created spark_dependencies.zip"
echo "You can now use --py-files spark_dependencies.zip when running spark-submit."
