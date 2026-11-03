# Examiner demo media assets

CampusConnect's optional examiner-demo media importer uses 21 bounded JPEG assets from Unsplash. The images are downloaded only during a separately confirmed import, copied into the existing private CampusConnect S3 bucket, and served through the configured CloudFront distribution. The application never hotlinks the source images.

The assets are covered by the [Unsplash License](https://unsplash.com/license), which permits free commercial and non-commercial use. CampusConnect does not resell or compile the images as a competing image service. Sources were selected to avoid recognizable students, real identity documents, watermarks, and prominent logos.

## Stable mapping

| Module       | Demo record                               | Source                             |
| ------------ | ----------------------------------------- | ---------------------------------- |
| Marketplace  | Casio FX-991ES Plus Scientific Calculator | `photo-1587145820266-a5951ee6f620` |
| Marketplace  | Data Structures and Algorithms Textbook   | `photo-1495446815901-a7297e633e8d` |
| Marketplace  | Almost-New College Backpack               | `photo-1553062407-98eeb64c6a62`    |
| Marketplace  | Wireless Mouse for Study Setup            | `photo-1527814050087-3793815479db` |
| Marketplace  | Mechanical Keyboard with Brown Switches   | `photo-1587829741301-dc798b83add3` |
| Marketplace  | LED Hostel Study Lamp                     | `photo-1507473885765-e6ed057f782c` |
| Marketplace  | Single-Speed Campus Bicycle               | `photo-1485965120184-e220f721d03e` |
| Marketplace  | Engineering Drawing Kit                   | `photo-1581092160607-ee22621dd758` |
| Marketplace  | Adjustable Aluminium Laptop Stand         | `photo-1496181133206-80ce9b88a853` |
| Marketplace  | Bluetooth Over-Ear Headphones             | `photo-1505740420928-5e560c06d30e` |
| Marketplace  | 24-inch Full HD Monitor                   | `photo-1527443224154-c4a3942d3acf` |
| Marketplace  | Bundle of Used Programming Books          | `photo-1516979187457-637abb4f9353` |
| Lost & Found | University ID Card in Blue Holder         | `photo-1606761568499-6d2451b23c66` |
| Lost & Found | Wireless Earbuds in Black Case            | `photo-1606220588913-b3aacb4d2f46` |
| Lost & Found | Casio Scientific Calculator               | `photo-1587145820266-a5951ee6f620` |
| Lost & Found | Blue Data Structures Notebook             | `photo-1531346878377-a5be20888e57` |
| Lost & Found | Blue Steel Water Bottle                   | `photo-1602143407151-7111542de6e8` |
| Lost & Found | Key Ring with Three Keys                  | `photo-1582139329536-e7284fece509` |
| Lost & Found | Black 32GB USB Drive                      | `photo-1618410320928-25228d811631` |
| Lost & Found | Black-Rimmed Spectacles                   | `photo-1511499767150-a48a237f0083` |
| Lost & Found | Grey College Backpack                     | `photo-1553062407-98eeb64c6a62`    |

TeamUp and Services are intentionally excluded. Although their database rows contain schema-level image JSON fields, their current repository projections, API contracts, and frontend cards do not expose images. Populating those fields would create invisible data outside a supported media workflow.

## Safety behavior

- One image is planned per supported record.
- Stable filenames identify previously imported demo associations.
- Records with any existing non-demo image are preserved and skipped.
- Successful earlier imports are preserved on rerun.
- Failed newly uploaded objects are removed only when no database association exists.
- Source MIME type and size are checked before upload; the existing 5 MiB limit remains enforced.
- Existing upload authorization, ownership verification, pending-key promotion, server-side encryption, private S3, and CloudFront URL generation remain authoritative.
