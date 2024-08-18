/**
 * v0 by Vercel.
 * @see https://v0.dev/t/tno2FJpyrC7
 * Documentation: https://v0.dev/docs#integrating-generated-code-into-your-nextjs-app
 */
"use client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/Components/ui/card"
import { Button } from "@/Components/ui/button"
import Layout from "../Components/Layout";
import getStripe from "@/utils/getstripe";
import Link from 'next/link'

export default function Component() {
  return (
    <Layout>
      <div className="container mx-auto py-12 px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle> Basic </CardTitle>
              <CardDescription> Get started with our basic plan for individuals. </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold"> $1 </span>
                <span className="text-muted-foreground"> /month </span>
              </div>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <CheckIcon className="mr-2 inline-block h-4 w-4" />
                  Access to basic features
                </li>
                <li>
                  <CheckIcon className="mr-2 inline-block h-4 w-4" />
                  5GB of cloud storage
                </li>
                <li>
                  <CheckIcon className="mr-2 inline-block h-4 w-4" />
                  Email support
                </li>
              </ul>
            </CardContent>
            <CardFooter>

              <Link href="/Checkout">
                <Button className="w-full" >Choose Basic</Button>
              </Link>

            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle> Premium </CardTitle>
              <CardDescription> Get the most out of our platform with the Premium plan. </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold"> $10 </span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <ul className="space-y-2 text-muted-foreground">
                <li>
                  <CheckIcon className="mr-2 inline-block h-4 w-4" />
                  Access to all features
                </li>
                <li>
                  <CheckIcon className="mr-2 inline-block h-4 w-4" />
                  100GB of cloud storage
                </li>
                <li>
                  <CheckIcon className="mr-2 inline-block h-4 w-4" />
                  Priority email support
                </li>
              </ul>
            </CardContent>
            <CardFooter>
              <Link href="/Chekout">
                <Button className="w-full" >Choose Premium</Button>
              </Link>
            </CardFooter>
          </Card>
        </div>
      </div>
    </Layout>
  )
}

function CheckIcon(props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}