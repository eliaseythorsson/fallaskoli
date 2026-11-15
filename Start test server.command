#!/bin/bash
# Double-click this file to start Fallaskóli for testing.
# Close the window (or press Ctrl + C) to stop it.
cd "$(dirname "$0")"
bash test-together.sh
echo
read -r -p "Press Enter to close this window. " _
