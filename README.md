# Ambulance Expiry Tracker

A phone web app for scanning ambulance supplies and keeping track of their expiry dates.

## What it does

- **Scan barcodes with the phone camera.** It reads the square DataMatrix codes, QR codes and normal 1-D barcodes (EAN/UPC, Code 128, GS1 DataBar…). If the camera doesn't work, you can **scan a photo** or type the code. Bluetooth or USB barcode scanners also work: tap the Barcode field and scan.
- **Fills in expiry and lot automatically** when the item has a GS1 barcode. Most medical supplies and drugs do: it's the code that holds `(01)` GTIN, `(17)` expiry and `(10)` lot.
- **Reads printed expiry dates from a photo.** For items with no barcode, or a barcode without the date, tap *Read expiry date from photo* and take a close-up of the printed date. It understands common formats (`EXP 2027-05`, `05/2027`, `15 MAY 2027`, `31/05/27`…). It skips manufacture dates. A month-only date counts as the last day of that month. If it finds more than one date, you can tap the right one. **Always check the date against the package before saving.**
- **Remembers products.** After you name an item once, scanning the same product again fills in the name and its usual location.
- **Shows what to deal with.** Items are sorted by expiry date and colour-coded:
  - 🔴 expired
  - 🟠 expiring soon (30 days by default; you can change this in Settings)
  - 🟢 OK
- **Filters** by status and by location (drug bag, cabinet, etc.), plus search.
- **Replace stock:** when you swap out an expired item, tap *Replace stock* and scan the new one.
- **Export** to a CSV spreadsheet or print an expiry report. You can also back up and restore all data as a JSON file.
- **Works offline** once it has been opened one time, and can be installed on the home screen.

## Using it

1. Host the folder (see below) and open the link on your phone.
2. Add it to the home screen. On iPhone: Share → *Add to Home Screen*. On Android: menu → *Install app*.
3. Open **Scan** → *Start camera* → point it at the barcode. Check the details, then tap **Save item**.
   The location stays filled in, so you can scan a whole bag or compartment in a row.
4. Check **Inventory** at the start of each shift.

## Hosting

It's a static site with no server or database. The easiest option is GitHub Pages: repo **Settings → Pages → Deploy from branch**, then pick the branch and the `/ (root)` folder. The camera needs **HTTPS**, and GitHub Pages provides it.

To run it on your computer: `npm start`, then open http://localhost:8080.

## Important limitations

- **Data is stored on the device, in the browser.** It is not shared between phones or crew members. Use *Download backup* regularly. Clearing the browser's website data will delete it.
- Reading dates from photos needs internet the first time (it downloads a ~10 MB text reader). It struggles with blurry photos, curved surfaces, shiny foil and faint embossed print. If it can't read the date, type it in.
- Dates like `03/04/2027` are read day-first (3 April), unless the phone is set to US English.
- If a barcode doesn't contain the expiry (normal retail barcodes), type the date in from the package.
- This tool helps with checks; it does not replace your service's official stock-check procedures.

## Tests

```
npm test
```
