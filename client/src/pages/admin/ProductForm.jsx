import { useEffect, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import Spinner, { PageLoader } from '../../components/ui/Spinner';
import { ErrorState } from '../../components/ui/EmptyState';
import { PageHeader, Panel } from '../../components/admin/AdminPage';
import ImageUploader from '../../components/admin/ImageUploader';
import { useFetch, useMutation } from '../../hooks/useApi';
import { applyFieldErrors, patch, post } from '../../lib/apiClient';
import { useToast } from '../../context/ToastContext';
import useSeo from '../../hooks/useSeo';
import { formatPrice } from '../../lib/format';

/**
 * Add / edit a product.
 *
 * One form for both, keyed off the presence of `:id`. A create and an edit differ only in
 * the endpoint and whether the fields start populated; duplicating 400 lines so the
 * heading can say "New" would guarantee the two drift.
 *
 * The shape submitted here mirrors `createProductSchema` exactly - same field names, same
 * nesting - so a server-side rejection maps onto a field via `applyFieldErrors` rather
 * than becoming an unexplained toast. Where the server can check something the client
 * cannot (a SKU already taken by another product, a district/province mismatch elsewhere),
 * the message lands on the input that caused it.
 *
 * Prices are whole rupees. `rupees` on the server rejects floats outright rather than
 * silently rounding, so `step={1}` here is not cosmetic.
 */

const SPICE_LEVELS = [
  { value: 'mild', label: 'Mild' },
  { value: 'medium', label: 'Medium' },
  { value: 'hot', label: 'Hot' },
  { value: 'extra-hot', label: 'Extra hot' },
];

const EMPTY_VARIANT = {
  size: '',
  sizeNp: '',
  weightGrams: 250,
  sku: '',
  price: '',
  discountPrice: '',
  stock: 0,
  lowStockThreshold: 5,
  isActive: true,
  isDefault: false,
};

const BLANK = {
  name: '',
  nameNp: '',
  sku: '',
  shortDescription: '',
  shortDescriptionNp: '',
  description: '',
  descriptionNp: '',
  category: '',
  subcategory: '',
  spiceLevel: 'medium',
  shelfLife: '',
  storageInstructions: '',
  origin: 'Nepal',
  isVegetarian: true,
  isFeatured: false,
  isBestSeller: false,
  isNewArrival: false,
  isActive: true,
  ingredientsText: '',
  allergensText: '',
  keywordsText: '',
  nutrition: { servingSize: '', calories: '', protein: '', carbohydrates: '', fat: '', sodium: '' },
  seo: { title: '', description: '' },
  variants: [{ ...EMPTY_VARIANT, isDefault: true }],
};

/** Comma-separated text field <-> array of trimmed strings. */
const toList = (text) =>
  String(text ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const fromList = (list) => (Array.isArray(list) ? list.join(', ') : '');

/** '' -> undefined so an untouched optional number is omitted rather than sent as NaN. */
const optionalNumber = (value) => {
  if (value === '' || value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export default function AdminProductForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [images, setImages] = useState([]);
  const [imageError, setImageError] = useState('');

  const categories = useFetch('/categories', { params: { includeInactive: true } });
  const existing = useFetch(isEdit ? `/products/admin/${id}` : null, { skip: !isEdit });

  useSeo({ title: isEdit ? 'Edit product · Admin' : 'New product · Admin', noIndex: true });

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({ defaultValues: BLANK });

  const { fields, append, remove } = useFieldArray({ control, name: 'variants' });

  // Populate from the API once. `reset` rather than per-field setValue so the form's
  // dirty tracking starts clean - otherwise the unsaved-changes state is true on load.
  useEffect(() => {
    const product = existing.data?.product;
    if (!product) return;

    reset({
      ...BLANK,
      ...product,
      category: product.category?._id ?? product.category ?? '',
      ingredientsText: fromList(product.ingredients),
      allergensText: fromList(product.allergens),
      keywordsText: fromList(product.keywords),
      nutrition: { ...BLANK.nutrition, ...(product.nutrition ?? {}) },
      seo: { ...BLANK.seo, ...(product.seo ?? {}) },
      variants: (product.variants ?? []).map((variant) => ({
        ...EMPTY_VARIANT,
        ...variant,
        // A null discount must become '' or the number input renders "null".
        discountPrice: variant.discountPrice ?? '',
      })),
    });
    setImages(product.images ?? []);
  }, [existing.data, reset]);

  const save = useMutation(
    (body) => (isEdit ? patch(`/products/admin/${id}`, body) : post('/products/admin', body)),
    {
      onSuccess: (result) => {
        toast.success(isEdit ? 'Product updated' : 'Product created');
        navigate(isEdit ? '/admin/products' : `/admin/products/${result.product._id}/edit`, {
          replace: true,
        });
      },
    }
  );

  const onSubmit = async (values) => {
    setImageError('');

    // Checked here rather than left to the server so the error appears next to the
    // uploader instead of at the top of a long form.
    if (!images.length) {
      setImageError('Add at least one product image');
      return;
    }
    const missingAlt = images.findIndex((image) => !image.alt?.trim());
    if (missingAlt >= 0) {
      setImageError(`Image ${missingAlt + 1} needs alt text`);
      return;
    }

    const nutrition = {
      servingSize: values.nutrition.servingSize || undefined,
      calories: optionalNumber(values.nutrition.calories),
      protein: optionalNumber(values.nutrition.protein),
      carbohydrates: optionalNumber(values.nutrition.carbohydrates),
      fat: optionalNumber(values.nutrition.fat),
      sodium: optionalNumber(values.nutrition.sodium),
    };
    const hasNutrition = Object.values(nutrition).some((value) => value !== undefined);

    const body = {
      name: values.name.trim(),
      nameNp: values.nameNp?.trim() || undefined,
      sku: values.sku.trim().toUpperCase(),
      shortDescription: values.shortDescription.trim(),
      shortDescriptionNp: values.shortDescriptionNp?.trim() || undefined,
      description: values.description.trim(),
      descriptionNp: values.descriptionNp?.trim() || undefined,
      category: values.category,
      subcategory: values.subcategory?.trim() || undefined,
      images: images.map((image) => ({
        url: image.url,
        publicId: image.publicId || undefined,
        alt: image.alt.trim(),
      })),
      // Position 0 is the thumbnail everywhere on the storefront, so it is derived
      // from the gallery order rather than being a separate field to keep in sync.
      thumbnail: images[0].url,
      variants: values.variants.map((variant, index) => ({
        ...(variant._id ? { _id: variant._id } : {}),
        size: variant.size.trim(),
        sizeNp: variant.sizeNp?.trim() || undefined,
        weightGrams: Number(variant.weightGrams),
        sku: variant.sku.trim().toUpperCase(),
        price: Number(variant.price),
        // null, not undefined: clearing a discount has to overwrite the stored value.
        discountPrice: variant.discountPrice === '' ? null : Number(variant.discountPrice),
        stock: Number(variant.stock),
        lowStockThreshold: Number(variant.lowStockThreshold),
        isActive: Boolean(variant.isActive),
        isDefault: Boolean(variant.isDefault) || (index === 0 && !values.variants.some((v) => v.isDefault)),
      })),
      ingredients: toList(values.ingredientsText),
      allergens: toList(values.allergensText),
      keywords: toList(values.keywordsText),
      ...(hasNutrition ? { nutrition } : {}),
      shelfLife: values.shelfLife?.trim() || undefined,
      storageInstructions: values.storageInstructions?.trim() || undefined,
      origin: values.origin?.trim() || undefined,
      spiceLevel: values.spiceLevel,
      isVegetarian: Boolean(values.isVegetarian),
      isFeatured: Boolean(values.isFeatured),
      isBestSeller: Boolean(values.isBestSeller),
      isNewArrival: Boolean(values.isNewArrival),
      isActive: Boolean(values.isActive),
      seo: {
        title: values.seo.title?.trim() || undefined,
        description: values.seo.description?.trim() || undefined,
      },
    };

    try {
      await save.run(body);
    } catch (error) {
      if (!applyFieldErrors(error, setError)) {
        toast.error(error?.normalised?.message ?? 'Could not save the product');
      }
    }
  };

  if (isEdit && existing.loading) return <PageLoader label="Loading product" />;
  if (isEdit && existing.error) {
    return <ErrorState error={existing.error} onRetry={existing.refetch} />;
  }

  const watchedName = watch('name');
  const watchedVariants = watch('variants');

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <PageHeader
        title={isEdit ? watchedName || 'Edit product' : 'New product'}
        breadcrumb={[
          { label: 'Products', to: '/admin/products' },
          { label: isEdit ? 'Edit' : 'New' },
        ]}
        description={
          isEdit
            ? 'Changes go live on the shop as soon as you save.'
            : 'Every product needs a category, one image and at least one size.'
        }
        actions={
          <>
            <Link to="/admin/products" className="btn-outline btn-sm">
              Cancel
            </Link>
            <button type="submit" disabled={isSubmitting || save.pending} className="btn-primary btn-sm">
              {isSubmitting || save.pending ? <Spinner className="size-4" /> : null}
              {isEdit ? 'Save changes' : 'Create product'}
            </button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* --- Basics --- */}
          <Panel title="Basics">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="name" className="field-label">
                  Product name
                </label>
                <input
                  id="name"
                  type="text"
                  maxLength={140}
                  aria-invalid={errors.name ? 'true' : undefined}
                  className="field-input"
                  {...register('name', { required: 'Product name is required' })}
                />
                {errors.name ? <p className="field-error">{errors.name.message}</p> : null}
              </div>

              <div>
                <label htmlFor="nameNp" className="field-label">
                  Name in Nepali <span className="text-ink-400">(optional)</span>
                </label>
                <input
                  id="nameNp"
                  type="text"
                  maxLength={140}
                  placeholder="मुलाको अचार"
                  className="field-input font-np"
                  {...register('nameNp')}
                />
              </div>

              <div>
                <label htmlFor="sku" className="field-label">
                  Product SKU
                </label>
                <input
                  id="sku"
                  type="text"
                  maxLength={40}
                  placeholder="ACH-MULA"
                  aria-invalid={errors.sku ? 'true' : undefined}
                  className="field-input uppercase"
                  {...register('sku', { required: 'SKU is required' })}
                />
                {errors.sku ? (
                  <p className="field-error">{errors.sku.message}</p>
                ) : (
                  <p className="field-hint">Unique across the catalogue. Saved in upper case.</p>
                )}
              </div>

              <div>
                <label htmlFor="category" className="field-label">
                  Category
                </label>
                <select
                  id="category"
                  aria-invalid={errors.category ? 'true' : undefined}
                  className="field-input"
                  {...register('category', { required: 'Choose a category' })}
                >
                  <option value="">Choose…</option>
                  {(categories.data?.categories ?? []).map((category) => (
                    <option key={category._id} value={category._id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {errors.category ? <p className="field-error">{errors.category.message}</p> : null}
              </div>

              <div>
                <label htmlFor="subcategory" className="field-label">
                  Subcategory <span className="text-ink-400">(optional)</span>
                </label>
                <input
                  id="subcategory"
                  type="text"
                  maxLength={80}
                  className="field-input"
                  {...register('subcategory')}
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="shortDescription" className="field-label">
                  Short description
                </label>
                <textarea
                  id="shortDescription"
                  rows={2}
                  maxLength={220}
                  aria-invalid={errors.shortDescription ? 'true' : undefined}
                  className="field-input resize-y"
                  {...register('shortDescription', { required: 'Short description is required' })}
                />
                {errors.shortDescription ? (
                  <p className="field-error">{errors.shortDescription.message}</p>
                ) : (
                  <p className="field-hint">
                    Shown on product cards and used as the meta description fallback. Up to 220
                    characters.
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="description" className="field-label">
                  Full description
                </label>
                <textarea
                  id="description"
                  rows={7}
                  maxLength={6000}
                  aria-invalid={errors.description ? 'true' : undefined}
                  className="field-input resize-y"
                  {...register('description', { required: 'Description is required' })}
                />
                {errors.description ? (
                  <p className="field-error">{errors.description.message}</p>
                ) : (
                  <p className="field-hint">
                    How it is made, how to eat it, what it goes with. Line breaks are kept.
                  </p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="descriptionNp" className="field-label">
                  Full description in Nepali <span className="text-ink-400">(optional)</span>
                </label>
                <textarea
                  id="descriptionNp"
                  rows={4}
                  maxLength={6000}
                  className="field-input font-np resize-y"
                  {...register('descriptionNp')}
                />
              </div>
            </div>
          </Panel>

          {/* --- Images --- */}
          <Panel title="Images">
            <ImageUploader images={images} onChange={setImages} folder="products" max={10} />
            {imageError ? (
              <p role="alert" className="field-error mt-2">
                {imageError}
              </p>
            ) : null}
          </Panel>

          {/* --- Sizes and pricing --- */}
          <Panel
            title="Sizes & pricing"
            actions={
              <button
                type="button"
                onClick={() => append({ ...EMPTY_VARIANT })}
                className="btn-outline btn-sm"
              >
                <Icon name="plus" className="size-4" />
                Add size
              </button>
            }
          >
            <p className="text-ink-500 mb-3 text-sm">
              Each size is priced and stocked separately. The first one, or whichever you mark as
              default, is the one selected when a customer opens the product.
            </p>

            {errors.variants?.message ? (
              <p className="field-error mb-2">{errors.variants.message}</p>
            ) : null}

            <ul className="space-y-3">
              {fields.map((field, index) => {
                const variantErrors = errors.variants?.[index] ?? {};
                const price = Number(watchedVariants?.[index]?.price);
                const discount = Number(watchedVariants?.[index]?.discountPrice);
                const savings =
                  Number.isFinite(price) && Number.isFinite(discount) && discount > 0 && discount < price
                    ? Math.round(((price - discount) / price) * 100)
                    : null;

                return (
                  <li key={field.id} className="border-cream-300 bg-cream-50 rounded-xl border p-3">
                    <div className="mb-2.5 flex items-center justify-between gap-2">
                      <p className="text-ink-700 text-sm font-semibold">Size {index + 1}</p>
                      {fields.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          className="btn-ghost btn-sm text-red-600"
                        >
                          <Icon name="trash" className="size-4" />
                          Remove
                        </button>
                      ) : null}
                    </div>

                    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <label htmlFor={`variants.${index}.size`} className="field-label">
                          Label
                        </label>
                        <input
                          id={`variants.${index}.size`}
                          type="text"
                          maxLength={30}
                          placeholder="250g"
                          aria-invalid={variantErrors.size ? 'true' : undefined}
                          className="field-input min-h-10 text-sm"
                          {...register(`variants.${index}.size`, { required: 'Required' })}
                        />
                        {variantErrors.size ? (
                          <p className="field-error">{variantErrors.size.message}</p>
                        ) : null}
                      </div>

                      <div>
                        <label htmlFor={`variants.${index}.weightGrams`} className="field-label">
                          Weight (g)
                        </label>
                        <input
                          id={`variants.${index}.weightGrams`}
                          type="number"
                          min={1}
                          max={50000}
                          step={1}
                          aria-invalid={variantErrors.weightGrams ? 'true' : undefined}
                          className="field-input min-h-10 text-sm"
                          {...register(`variants.${index}.weightGrams`, {
                            required: 'Required',
                            min: { value: 1, message: 'Must be at least 1g' },
                          })}
                        />
                        {variantErrors.weightGrams ? (
                          <p className="field-error">{variantErrors.weightGrams.message}</p>
                        ) : null}
                      </div>

                      <div className="sm:col-span-2">
                        <label htmlFor={`variants.${index}.sku`} className="field-label">
                          Size SKU
                        </label>
                        <input
                          id={`variants.${index}.sku`}
                          type="text"
                          maxLength={40}
                          placeholder="ACH-MULA-250"
                          aria-invalid={variantErrors.sku ? 'true' : undefined}
                          className="field-input min-h-10 text-sm uppercase"
                          {...register(`variants.${index}.sku`, { required: 'Required' })}
                        />
                        {variantErrors.sku ? (
                          <p className="field-error">{variantErrors.sku.message}</p>
                        ) : null}
                      </div>

                      <div>
                        <label htmlFor={`variants.${index}.price`} className="field-label">
                          Price (Rs.)
                        </label>
                        <input
                          id={`variants.${index}.price`}
                          type="number"
                          min={1}
                          step={1}
                          aria-invalid={variantErrors.price ? 'true' : undefined}
                          className="field-input tnum min-h-10 text-sm"
                          {...register(`variants.${index}.price`, {
                            required: 'Required',
                            min: { value: 1, message: 'Must be above zero' },
                          })}
                        />
                        {variantErrors.price ? (
                          <p className="field-error">{variantErrors.price.message}</p>
                        ) : null}
                      </div>

                      <div>
                        <label htmlFor={`variants.${index}.discountPrice`} className="field-label">
                          Sale price
                        </label>
                        <input
                          id={`variants.${index}.discountPrice`}
                          type="number"
                          min={0}
                          step={1}
                          placeholder="—"
                          aria-invalid={variantErrors.discountPrice ? 'true' : undefined}
                          className="field-input tnum min-h-10 text-sm"
                          {...register(`variants.${index}.discountPrice`, {
                            validate: (value) => {
                              if (value === '' || value == null) return true;
                              const asNumber = Number(value);
                              const regular = Number(watchedVariants?.[index]?.price);
                              if (!Number.isFinite(asNumber)) return 'Enter a number';
                              if (Number.isFinite(regular) && asNumber >= regular) {
                                return 'Must be below the regular price';
                              }
                              return true;
                            },
                          })}
                        />
                        {variantErrors.discountPrice ? (
                          <p className="field-error">{variantErrors.discountPrice.message}</p>
                        ) : savings ? (
                          <p className="field-hint text-leaf-700">{savings}% off</p>
                        ) : (
                          <p className="field-hint">Leave empty for no offer</p>
                        )}
                      </div>

                      <div>
                        <label htmlFor={`variants.${index}.stock`} className="field-label">
                          Stock
                        </label>
                        <input
                          id={`variants.${index}.stock`}
                          type="number"
                          min={0}
                          step={1}
                          className="field-input tnum min-h-10 text-sm"
                          {...register(`variants.${index}.stock`, { required: 'Required', min: 0 })}
                        />
                      </div>

                      <div>
                        <label htmlFor={`variants.${index}.lowStockThreshold`} className="field-label">
                          Low stock at
                        </label>
                        <input
                          id={`variants.${index}.lowStockThreshold`}
                          type="number"
                          min={0}
                          step={1}
                          className="field-input tnum min-h-10 text-sm"
                          {...register(`variants.${index}.lowStockThreshold`)}
                        />
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-4">
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 cursor-pointer"
                          {...register(`variants.${index}.isActive`)}
                        />
                        Available to buy
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 cursor-pointer"
                          {...register(`variants.${index}.isDefault`)}
                        />
                        Default size
                      </label>
                      {Number.isFinite(price) && price > 0 ? (
                        <span className="text-ink-400 ml-auto text-xs">
                          Sells at {formatPrice(savings ? discount : price)}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>

          {/* --- The jar details --- */}
          <Panel title="Ingredients & storage">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="ingredientsText" className="field-label">
                  Ingredients
                </label>
                <input
                  id="ingredientsText"
                  type="text"
                  className="field-input"
                  placeholder="Radish, mustard oil, sesame, timur, turmeric, salt"
                  {...register('ingredientsText')}
                />
                <p className="field-hint">Separate with commas.</p>
              </div>

              <div>
                <label htmlFor="allergensText" className="field-label">
                  Allergens
                </label>
                <input
                  id="allergensText"
                  type="text"
                  className="field-input"
                  placeholder="Sesame, mustard"
                  {...register('allergensText')}
                />
              </div>

              <div>
                <label htmlFor="spiceLevel" className="field-label">
                  Spice level
                </label>
                <select id="spiceLevel" className="field-input" {...register('spiceLevel')}>
                  {SPICE_LEVELS.map((level) => (
                    <option key={level.value} value={level.value}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="shelfLife" className="field-label">
                  Shelf life
                </label>
                <input
                  id="shelfLife"
                  type="text"
                  maxLength={80}
                  placeholder="6 months unopened"
                  className="field-input"
                  {...register('shelfLife')}
                />
              </div>

              <div>
                <label htmlFor="origin" className="field-label">
                  Origin
                </label>
                <input
                  id="origin"
                  type="text"
                  maxLength={80}
                  className="field-input"
                  {...register('origin')}
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="storageInstructions" className="field-label">
                  Storage instructions
                </label>
                <textarea
                  id="storageInstructions"
                  rows={2}
                  maxLength={300}
                  placeholder="Keep in a cool dry place. Refrigerate after opening and always use a dry spoon."
                  className="field-input resize-y"
                  {...register('storageInstructions')}
                />
              </div>
            </div>
          </Panel>

          <Panel title="Nutrition (optional)">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="nutrition.servingSize" className="field-label">
                  Serving size
                </label>
                <input
                  id="nutrition.servingSize"
                  type="text"
                  maxLength={40}
                  placeholder="20g"
                  className="field-input"
                  {...register('nutrition.servingSize')}
                />
              </div>
              {[
                ['calories', 'Calories (kcal)'],
                ['protein', 'Protein (g)'],
                ['carbohydrates', 'Carbs (g)'],
                ['fat', 'Fat (g)'],
                ['sodium', 'Sodium (mg)'],
              ].map(([key, label]) => (
                <div key={key}>
                  <label htmlFor={`nutrition.${key}`} className="field-label">
                    {label}
                  </label>
                  <input
                    id={`nutrition.${key}`}
                    type="number"
                    min={0}
                    step="any"
                    className="field-input tnum"
                    {...register(`nutrition.${key}`)}
                  />
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* --- Sidebar --- */}
        <div className="space-y-4">
          <Panel title="Visibility">
            <div className="space-y-2.5">
              {[
                ['isActive', 'Show on the shop', 'Uncheck to hide without deleting'],
                ['isFeatured', 'Featured', 'Appears in the home page rail'],
                ['isBestSeller', 'Best seller', 'Adds the best-seller badge'],
                ['isNewArrival', 'New arrival', 'Adds the new badge'],
                ['isVegetarian', 'Vegetarian', 'Shown on the product page'],
              ].map(([key, label, hint]) => (
                <label key={key} className="flex cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 cursor-pointer"
                    {...register(key)}
                  />
                  <span className="min-w-0">
                    <span className="text-ink-800 block text-sm font-medium">{label}</span>
                    <span className="text-ink-400 block text-xs">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </Panel>

          <Panel title="Search engines">
            <div className="space-y-3">
              <div>
                <label htmlFor="seo.title" className="field-label">
                  Page title
                </label>
                <input
                  id="seo.title"
                  type="text"
                  maxLength={70}
                  className="field-input"
                  {...register('seo.title')}
                />
                <p className="field-hint">Falls back to the product name. Up to 70 characters.</p>
              </div>

              <div>
                <label htmlFor="seo.description" className="field-label">
                  Meta description
                </label>
                <textarea
                  id="seo.description"
                  rows={3}
                  maxLength={180}
                  className="field-input resize-y"
                  {...register('seo.description')}
                />
                <p className="field-hint">Falls back to the short description.</p>
              </div>

              <div>
                <label htmlFor="keywordsText" className="field-label">
                  Keywords
                </label>
                <input
                  id="keywordsText"
                  type="text"
                  className="field-input"
                  placeholder="mula ko achar, radish pickle, nepali achar"
                  {...register('keywordsText')}
                />
                <p className="field-hint">Comma separated. Used for on-site search too.</p>
              </div>
            </div>
          </Panel>

          <div className="card p-4">
            <button
              type="submit"
              disabled={isSubmitting || save.pending}
              className="btn-primary w-full"
            >
              {isSubmitting || save.pending ? <Spinner className="size-4" /> : null}
              {isEdit ? 'Save changes' : 'Create product'}
            </button>
            {isEdit && isDirty ? (
              <p className="text-mustard-800 mt-2 text-center text-xs">You have unsaved changes.</p>
            ) : null}
          </div>
        </div>
      </div>
    </form>
  );
}
