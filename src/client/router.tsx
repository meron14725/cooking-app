import { createBrowserRouter } from 'react-router'
import { Layout } from './components/Layout'
import { CookPage } from './routes/CookPage'
import { FridgePage } from './routes/FridgePage'
import { HomePage } from './routes/HomePage'
import { IngredientEditPage } from './routes/IngredientEditPage'
import { IngredientsPage } from './routes/IngredientsPage'
import { MorePage } from './routes/MorePage'
import { NotFoundPage } from './routes/NotFoundPage'
import { PlanPage } from './routes/PlanPage'
import { RecipeEditPage } from './routes/RecipeEditPage'
import { RecipeImportPage } from './routes/RecipeImportPage'
import { RecipesPage } from './routes/RecipesPage'

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'fridge', element: <FridgePage /> },
      { path: 'plan', element: <PlanPage /> },
      { path: 'kits/:id/cook', element: <CookPage /> },
      { path: 'recipes', element: <RecipesPage /> },
      { path: 'recipes/new', element: <RecipeEditPage /> },
      { path: 'recipes/import', element: <RecipeImportPage /> },
      { path: 'recipes/:id', element: <RecipeEditPage /> },
      { path: 'more', element: <MorePage /> },
      { path: 'ingredients', element: <IngredientsPage /> },
      { path: 'ingredients/new', element: <IngredientEditPage /> },
      { path: 'ingredients/:id', element: <IngredientEditPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
